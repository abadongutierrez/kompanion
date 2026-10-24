---
name: preflight-check
description: Use at the very start of a Kompanion task, before you plan or change anything, to confirm everything the work needs is in place - the task has what you need to act on, the manifest and task workspace are there, and in a repository the worktree is on the right branch and ready to commit. Stop and report if it fails.
---

# Preflight check

Run this first, before any real work. It tells you whether the run is set up
right, so you do not spend a whole run on work you cannot finish or commit.
It never changes anything.

## 1. Run the script

The script is `scripts/preflight.py`, next to this file. It takes no
arguments and prints one line per check, starting with `ok`, `warn` or
`FAIL`. It exits 1 when any check failed.

- **Claude Code.** Shell commands only run through the wrapper, so use it:

  ```
  python3 .claude/hooks/exec_in_folder.py --taskId "$TASK_ID" --folder . --command "python3 .claude/skills/preflight-check/scripts/preflight.py"
  ```

- **pi** and **opencode.** Run it directly, from the folder this skill was
  loaded from: `python3 <skill folder>/scripts/preflight.py`.

It checks the manifest, the task workspace, that the current folder is an
allowed root, every worktree, and in repository mode the branch, the git
user and whether the working tree is clean.

## 2. Check the task yourself

The script cannot read your prompt. Check these by hand:

- The prompt has a `Task:` title and a `Description:` that says what to do.
  Acceptance criteria help but are not required.
- The `Workspace:` line agrees with the script: a repository when it found
  one, scratch when it did not.
- Read the task workspace. If an earlier note or a QA verdict says the task is
  blocked or done, take that into account.

## 3. Decide

- **Everything `ok`:** go on with the task.
- **Only `warn`:** go on, and mention each warning in your handoff note.
  Uncommitted changes are often your own earlier attempt — look before you
  build on them or discard them.
- **Any `FAIL`, or the task has nothing to act on:** do not start the work.
  Write `preflight.md` in the task workspace with the failing lines and what
  would fix them, then stop and say the task is blocked. If the task
  workspace itself is the problem, put the same text in your reply instead.

If the script prints `TASK_WORKSPACE_DIR is not set`, you are not inside a
Kompanion task.
