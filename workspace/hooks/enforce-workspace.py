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
worse than refusing).

Bash: best-effort only, not a hard guarantee. A stateless hook can't tell a
legitimate `cd` into a secondary linked repo (from several calls ago, still
in effect via Claude Code's persistent shell) apart from genuine drift, so
only commands with no `cd` at all get anchored to the primary root — a
command that already navigates somewhere is trusted.
"""
import json
import os
import sys

FILE_PATH_TOOLS = {"Edit", "Write", "MultiEdit", "Read"}


def load_allowed_roots():
    # TASK_WORKSPACE_DIR is set on the claude process's own environment at
    # spawn time and inherited by this hook subprocess (confirmed: hook
    # commands inherit the parent process's env) — manifest.json lives
    # there, not under this script's own directory.
    task_workspace_dir = os.environ["TASK_WORKSPACE_DIR"]
    manifest_path = os.path.join(task_workspace_dir, "manifest.json")
    with open(manifest_path) as f:
        manifest = json.load(f)
    roots = [manifest["primary"]["workspaceLocalPath"]]
    roots += [r["workspaceLocalPath"] for r in manifest.get("otherRepos", [])]
    return roots


def is_under_any_root(path, roots):
    abspath = os.path.abspath(path)
    return any(
        abspath == root or abspath.startswith(root.rstrip(os.sep) + os.sep)
        for root in roots
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
        command = tool_input.get("command", "")
        stripped = command.strip()
        has_cd = stripped.startswith("cd ") or " cd " in f" {command} "
        if not has_cd:
            new_command = f'cd "{primary}" && ({command})'
            allow({"updatedInput": {"command": new_command}})
            return
        allow()
        return

    allow()


if __name__ == "__main__":
    main()
