import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceRoot } from "./claudeHarness.js";

const hooksSrcDir = join(workspaceRoot, "hooks");
// enforce-workspace.py denies every raw Bash call except one shape:
// invoking exec_in_folder.py, which does its own folder-membership check
// and logs to commands.log — both scripts (plus the helper module they
// share) have to travel together into the workspace.
const HOOK_FILES = ["enforce-workspace.py", "exec_in_folder.py", "_workspace_common.py"];

const ENFORCEMENT_MATCHER = "Bash|Edit|Write|MultiEdit|Read";
const ENFORCEMENT_COMMAND =
  "python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/enforce-workspace.py";

export type ManifestRepoEntry = {
  name: string | null;
  repositoryLocalPath: string | null;
  workspaceLocalPath: string;
};

// The single source of truth for "where am I, what branch, what repo" for a
// Task's run — written once by our own server code (which already knows
// these values with certainty at workspace-prep time), not computed or
// discovered by the model. Readable by any skill via a plain `cat
// manifest.json`, and by the PreToolUse enforcement hook
// (enforce-workspace.py), which derives its allowed-roots check from this
// same file instead of a separate one.
export type WorkspaceManifest = {
  branchName: string | null;
  primary: ManifestRepoEntry;
  otherRepos: ManifestRepoEntry[];
};

type SettingsJson = {
  hooks?: {
    PreToolUse?: Array<{
      matcher?: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
    [event: string]: unknown;
  };
  [key: string]: unknown;
};

// manifest.json (and, via the TASK_WORKSPACE_DIR env var each harness's Stop
// hook writes activity.log to) live in the Task's own workspace folder, not
// inside the real repository being worked on — they're our app's metadata
// about the run, not part of the deliverable, and shouldn't show up in that
// repo at all (not even as a gitignored file sitting in the tree). cwdDir
// (where .claude/ + settings.json live, since hooks only resolve from the
// exact cwd) is a separate directory: the scratch workspace, or now a real
// repo's worktree.
export function installCwdEnforcement(
  cwdDir: string,
  taskWorkspaceDir: string,
  manifest: WorkspaceManifest,
): void {
  mkdirSync(taskWorkspaceDir, { recursive: true });
  writeFileSync(join(taskWorkspaceDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const hooksDir = join(cwdDir, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  for (const file of HOOK_FILES) {
    cpSync(join(hooksSrcDir, file), join(hooksDir, file));
  }

  const settingsPath = join(cwdDir, ".claude", "settings.json");
  let settings: SettingsJson = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }
  }

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  settings.hooks.PreToolUse.push({
    matcher: ENFORCEMENT_MATCHER,
    hooks: [{ type: "command", command: ENFORCEMENT_COMMAND }],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
