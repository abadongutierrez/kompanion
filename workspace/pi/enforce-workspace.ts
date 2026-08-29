/**
 * pi extension enforcing that a run's file and shell operations stay within
 * this Task's allowed directories — the same guarantee the Claude Code
 * PreToolUse hook (workspace/hooks/enforce-workspace.py) gives, expressed
 * through pi's blocking `tool_call` event.
 *
 * Loaded by absolute path with `-e`, which bypasses pi's project-trust gate,
 * so nothing has to be copied into the repository being worked on.
 *
 * Allowed roots come from manifest.json in TASK_WORKSPACE_DIR — written fresh
 * every run by our own server code, the single source of truth for
 * branch/repo paths — not from anything the model can influence.
 *
 * read/write/edit/ls/grep/find: a relative `path` is resolved against the
 * primary root; an absolute `path` outside every allowed root is blocked
 * rather than silently redirected (guessing where it "should" go is worse
 * than refusing). The roots are the linked repositories' worktrees plus the
 * Task's own workspace folder, where plans and handoff files for the next
 * agent belong. manifest.json inside it is read-only: this extension reads
 * its own permissions from it.
 *
 * bash: not blocked, but rewritten to run through exec_in_folder.py, which
 * re-checks folder membership and appends to commands.log — the same audit
 * trail Claude Code runs produce, and the same script, so the two can't drift
 * on what "allowed" means.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

// Every built-in tool that takes a filesystem `path`. bash is handled
// separately; anything else (extension tools, ask_question) is left alone.
const PATH_TOOLS = new Set(["read", "write", "edit", "ls", "grep", "find"]);
const WRITE_TOOLS = new Set(["write", "edit"]);
const SHELL_TOOLS = new Set(["bash", "powershell"]);

// Where the run's manifest lives, and the one file inside the allowed roots
// that must stay read-only.
function manifestPath(): string | null {
  const taskWorkspaceDir = process.env.TASK_WORKSPACE_DIR;
  return taskWorkspaceDir ? resolve(join(taskWorkspaceDir, "manifest.json")) : null;
}

function allowedRoots(): string[] | null {
  // Set on the pi process's own environment at spawn time by RunTaskService.
  // Missing manifest means enforcement isn't installed for this workspace
  // (shouldn't happen for a task run) — fail open rather than block
  // everything, matching the Python hook.
  const taskWorkspaceDir = process.env.TASK_WORKSPACE_DIR;
  if (!taskWorkspaceDir) return null;
  try {
    const manifest = JSON.parse(readFileSync(join(taskWorkspaceDir, "manifest.json"), "utf-8"));
    const roots: string[] = [manifest.primary.workspaceLocalPath];
    for (const repo of manifest.otherRepos ?? []) roots.push(repo.workspaceLocalPath);
    // The Task's own folder: writable, because that is where plans and notes
    // for the next agent go. It equals primary in scratch mode, hence the
    // dedupe.
    if (manifest.taskWorkspace && !roots.includes(manifest.taskWorkspace)) {
      roots.push(manifest.taskWorkspace);
    }
    return roots.filter(Boolean);
  } catch {
    return null;
  }
}

function isUnderAnyRoot(path: string, roots: string[]): boolean {
  const abs = resolve(path);
  return roots.some((root) => {
    const normalized = resolve(root);
    return abs === normalized || abs.startsWith(normalized.endsWith(sep) ? normalized : normalized + sep);
  });
}

// Single-quoted so the command reaches exec_in_folder.py as one argument,
// untouched by the shell pi runs it in.
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event: any, ctx: any) => {
    const roots = allowedRoots();
    if (!roots || roots.length === 0) return;
    const primary = roots[0];

    if (PATH_TOOLS.has(event.toolName)) {
      const path = event.input?.path;
      // ls/grep/find default to the cwd, which is the primary root already.
      if (typeof path !== "string" || path.length === 0) return;
      const absolute = isAbsolute(path) ? resolve(path) : resolve(join(primary, path));
      if (WRITE_TOOLS.has(event.toolName) && absolute === manifestPath()) {
        return {
          block: true,
          reason:
            "manifest.json is written by the platform each run and is read-only — " +
            "it is where this check reads your allowed directories from. " +
            "Write your own files next to it instead.",
        };
      }
      if (!isAbsolute(path)) {
        event.input.path = join(primary, path);
        return;
      }
      if (!isUnderAnyRoot(path, roots)) {
        return {
          block: true,
          reason:
            `"${path}" is outside this task's allowed directories: ` +
            `${JSON.stringify(roots)}. Use one of these.`,
        };
      }
      return;
    }

    if (SHELL_TOOLS.has(event.toolName)) {
      const command = event.input?.command;
      if (typeof command !== "string" || command.length === 0) return;
      // Set alongside TASK_WORKSPACE_DIR by PiRunner. Absent means this isn't
      // one of our runs, so leave the command alone — same fail-open rule as
      // a missing manifest.
      const execInFolder = process.env.KOMPANION_EXEC_IN_FOLDER;
      if (!execInFolder) return;
      // Already wrapped (a retry, or a second handler): wrapping twice would
      // nest the quoting and log the same command under two entries.
      if (command.includes("exec_in_folder.py")) return;
      const folder = ctx?.cwd ?? primary;
      event.input.command =
        `python3 ${shellQuote(execInFolder)}` +
        ` --taskId ${shellQuote(process.env.TASK_ID ?? "")}` +
        ` --folder ${shellQuote(folder)}` +
        ` --command ${shellQuote(command)}`;
    }
  });
}
