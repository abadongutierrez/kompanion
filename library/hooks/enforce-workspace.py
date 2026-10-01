#!/usr/bin/env python3
"""
PreToolUse hook enforcing that Edit/Write/MultiEdit/Read/Bash operations stay
within this Task's allowed directories — derived from manifest.json in the
Task's own workspace folder (TASK_WORKSPACE_DIR — a separate directory from
the real repo being worked on, deliberately; manifest.json/activity.log are
our app's metadata about the run, not part of the repo), written fresh every
run by our own server code, the single source of truth for branch/repo
paths — not left to the model's own cd/pathing.

Edit/Write/MultiEdit/Read: hard guarantee. A relative file_path is resolved
against the primary root; an absolute file_path outside every allowed root
is denied rather than silently redirected (guessing where it "should" go is
worse than refusing). The allowed roots are the linked repositories' worktrees
plus the Task's own workspace folder — the latter is where plans, notes and
handoff files for the next agent belong. The one exception inside them is
manifest.json, which is read-only: this hook reads its own permissions from
it.

Bash: also a hard guarantee now — every raw Bash command is denied outright
except one exact shape: invoking exec_in_folder.py (which does its own
folder-membership check, then runs the command and logs it to
commands.log). This replaces the previous best-effort cd-detection
heuristic, which could only anchor commands with no `cd` at all and had to
trust anything that already navigated somewhere.
"""
import json
import os
import sys

from _workspace_common import is_under_any_root, load_allowed_roots, manifest_path

FILE_PATH_TOOLS = {"Edit", "Write", "MultiEdit", "Read"}
WRITE_TOOLS = {"Edit", "Write", "MultiEdit"}

EXEC_IN_FOLDER_HINT = (
    'Raw Bash commands aren\'t allowed. Use: python3 '
    '.claude/hooks/exec_in_folder.py '
    '--taskId <id> --folder <path> --command "..."'
)


def allow(extra=None):
    output = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}
    if extra:
        output["hookSpecificOutput"].update(extra)
    print(json.dumps(output))


def deny(reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )


def main():
    payload = json.load(sys.stdin)
    tool_name = payload.get("tool_name")
    tool_input = payload.get("tool_input") or {}

    try:
        allowed_roots = load_allowed_roots()
    except (OSError, KeyError, json.JSONDecodeError):
        # No roots file means enforcement isn't installed for this
        # workspace (shouldn't happen for a task run) — fail open rather
        # than block everything.
        allow()
        return

    primary = allowed_roots[0]

    if tool_name in FILE_PATH_TOOLS:
        file_path = tool_input.get("file_path")
        if not file_path:
            allow()
            return
        if tool_name in WRITE_TOOLS and os.path.abspath(
            file_path if os.path.isabs(file_path) else os.path.join(primary, file_path)
        ) == manifest_path():
            deny(
                "manifest.json is written by the platform each run and is "
                "read-only — it is where this hook reads your allowed "
                "directories from. Write your own files next to it instead."
            )
            return
        if os.path.isabs(file_path):
            if is_under_any_root(file_path, allowed_roots):
                allow()
            else:
                deny(
                    f'"{file_path}" is outside this task\'s allowed directories: '
                    f"{allowed_roots}. Use one of these."
                )
            return
        new_path = os.path.join(primary, file_path)
        allow({"updatedInput": {"file_path": new_path}})
        return

    if tool_name == "Bash":
        command = tool_input.get("command", "").strip()
        if command.startswith("python3") and "exec_in_folder.py" in command:
            allow()
            return
        deny(EXEC_IN_FOLDER_HINT)
        return

    allow()


if __name__ == "__main__":
    main()
