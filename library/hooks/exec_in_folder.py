#!/usr/bin/env python3
"""
The sanctioned way to run a shell command for a Task: validates --folder
against this Task's allowed directories (same manifest.json enforce-
workspace.py reads) before running anything, and logs every invocation to
commands.log in the Task's own workspace folder — the audit trail that
makes verifying/allow-listing commands later possible. The PreToolUse hook
(enforce-workspace.py) denies any raw Bash call that doesn't invoke this
script, so this is the only way a command actually runs.

Usage:
  exec_in_folder.py --taskId <id> --folder <path> --command "git log"
"""
import argparse
import datetime
import json
import os
import subprocess
import sys

from _workspace_common import is_under_any_root, load_allowed_roots


def fail(message):
    print(f"exec_in_folder.py: {message}", file=sys.stderr)
    sys.exit(2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taskId", required=True)
    parser.add_argument("--folder", required=True)
    parser.add_argument("--command", required=True)
    args = parser.parse_args()

    # Not the real security boundary (folder membership, below, is) — but
    # keeps commands.log honest and fails loudly on a mismatched taskId
    # rather than silently attributing a command to the wrong task.
    expected_task_id = os.environ.get("TASK_ID")
    if expected_task_id and args.taskId != expected_task_id:
        fail(
            f'--taskId "{args.taskId}" does not match the running task '
            f'"{expected_task_id}".'
        )

    try:
        allowed_roots = load_allowed_roots()
    except (OSError, KeyError, json.JSONDecodeError) as e:
        fail(f"couldn't load this task's allowed directories ({e}).")
        return

    folder = os.path.abspath(args.folder)
    if not is_under_any_root(folder, allowed_roots):
        fail(
            f'"{args.folder}" is outside this task\'s allowed directories: '
            f"{allowed_roots}. Use one of these."
        )

    task_workspace_dir = os.environ["TASK_WORKSPACE_DIR"]
    log_path = os.path.join(task_workspace_dir, "commands.log")

    result = subprocess.run(args.command, shell=True, cwd=folder)

    with open(log_path, "a") as f:
        f.write(
            json.dumps(
                {
                    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "taskId": args.taskId,
                    "folder": folder,
                    "command": args.command,
                    "exitCode": result.returncode,
                }
            )
            + "\n"
        )

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
