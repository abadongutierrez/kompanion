---
name: kompanion-context
description: Use when you need to know where you are working in a Kompanion task, such as your git worktree, your task workspace folder for plans and handoff notes, the task's branch, any other linked repositories, or which folders you may write in.
---

# Kompanion context

Every Kompanion run has a `manifest.json` that says where you work. This
skill reads it for you with a small read-only script. It never changes
anything.

The script is `scripts/manifest.py`, next to this file. Run it with `python3`
and one command:

| Command | Prints |
| --- | --- |
| `worktree` | The folder you work and commit in. |
| `task-workspace` | Your own folder for this task. Plans, notes and handoff files go here. The other agents on this task use it too. |
| `branch` | The task's git branch. Nothing is printed when no repository is linked. |
| `repos` | Every linked repository as JSON: its role (`primary` or `other`), name, repository path and worktree path. |
| `roots` | Every folder you may write in, one per line. Anything else is refused. |

Use `task-workspace` whenever you write a note for the next agent, and
`worktree` before you change code.

## Running it

- **Claude Code.** Shell commands only run through the wrapper, so use it:

  ```
  python3 .claude/hooks/exec_in_folder.py --taskId "$TASK_ID" --folder . --command "python3 .claude/skills/kompanion-context/scripts/manifest.py task-workspace"
  ```

- **pi.** Run the script directly. Shell commands are wrapped for you. Use the
  folder this skill was loaded from: `python3 <skill folder>/scripts/manifest.py task-workspace`.

- **opencode.** Run it directly, from the folder this skill was loaded from:
  `python3 <skill folder>/scripts/manifest.py task-workspace`.

If it prints `TASK_WORKSPACE_DIR is not set`, you are not inside a Kompanion
task, and the answer is not available.
