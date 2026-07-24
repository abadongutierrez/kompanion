import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Repository, Task } from "@sdlc/shared";

const BRANCH_PREFIX_BY_TYPE: Record<Task["type"], string> = {
  bug: "fix",
  story: "feat",
  chore: "chore",
  spike: "spike",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export function taskBranchName(task: Task): string {
  const prefix = BRANCH_PREFIX_BY_TYPE[task.type] ?? "task";
  return `${prefix}/${task.id}-${slugify(task.title)}`;
}

// Deliberately inside the repo's own directory, not our app's internal
// folder — actual implementation work (worktree creation, file edits,
// commits) must happen at the repository's own configured location. Hidden
// so it doesn't clutter a normal directory listing; still needs excluding
// from git's own view (see ensureRepoExcludes) since it sits inside a
// tracked working tree.
export function resolveRepoWorktreeDir(repo: Repository, task: Task): string {
  return join(repo.localPath, ".worktrees", `${task.id}-${slugify(task.title)}`);
}

// Idempotent: appends each pattern to the repo's shared .git/info/exclude
// (not the project's own tracked .gitignore) only if not already present,
// so `git status`/`git add -A` never surface our worktree/harness dirs as
// clutter in either the main clone or any of its worktrees (info/exclude is
// shared across all of a repo's worktrees via the common git dir).
export function ensureRepoExcludes(repo: Repository): void {
  const excludePath = join(repo.localPath, ".git", "info", "exclude");
  const patterns = [".worktrees/", ".claude/"];
  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  const existingLines = new Set(existing.split("\n").map((l) => l.trim()));
  const missing = patterns.filter((p) => !existingLines.has(p));
  if (missing.length === 0) return;

  mkdirSync(join(repo.localPath, ".git", "info"), { recursive: true });
  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(excludePath, existing + separator + missing.join("\n") + "\n");
}

export type RepoWorktree = {
  repo: Repository;
  worktreeDir: string;
};

// Idempotent per repo: if a repo's worktree already exists, reuse it as-is —
// a Task re-run or a role handoff (Engineer -> QA -> PM) must land in the
// same branch/directory, not a fresh one each time.
export function ensureWorktrees(task: Task, repos: Repository[]): RepoWorktree[] {
  const branchName = taskBranchName(task);

  return repos.map((repo) => {
    ensureRepoExcludes(repo);
    const worktreeDir = resolveRepoWorktreeDir(repo, task);

    if (!existsSync(worktreeDir)) {
      mkdirSync(join(repo.localPath, ".worktrees"), { recursive: true });
      execFileSync(
        "git",
        [
          "-C",
          repo.localPath,
          "worktree",
          "add",
          worktreeDir,
          "-b",
          branchName,
          repo.defaultBranch,
        ],
        { stdio: "pipe" },
      );
    }

    return { repo, worktreeDir };
  });
}
