#!/usr/bin/env python3
"""
Shared helpers for enforce-workspace.py and exec_in_folder.py — both read
the same manifest.json (written fresh every run by our own server code,
the single source of truth for branch/repo paths) to derive this Task's
allowed directories. Kept as one module so the two scripts can't drift on
what "allowed" means.
"""
import json
import os


def manifest_path():
    """Where the run's manifest lives. Also the one file inside the allowed
    roots that must stay read-only: it is where these scripts read the roots
    from, so an agent able to rewrite it could widen its own permissions.

    TASK_WORKSPACE_DIR is set on the agent process's own environment at spawn
    time and inherited by subprocesses.
    """
    return os.path.abspath(
        os.path.join(os.environ["TASK_WORKSPACE_DIR"], "manifest.json")
    )


def load_allowed_roots():
    # TASK_WORKSPACE_DIR is set on the claude process's own environment at
    # spawn time and inherited by subprocesses (confirmed: hook/command
    # subprocesses inherit the parent process's env) — manifest.json lives
    # there, not under either script's own directory.
    with open(manifest_path()) as f:
        manifest = json.load(f)
    roots = [manifest["primary"]["workspaceLocalPath"]]
    roots += [r["workspaceLocalPath"] for r in manifest.get("otherRepos", [])]
    # The Task's own folder under its Project's workspace: writable, because
    # that is where plans, notes and handoff files for the next agent go. In
    # scratch mode it is the same directory as primary, hence the dedupe.
    task_workspace = manifest.get("taskWorkspace")
    if task_workspace and task_workspace not in roots:
        roots.append(task_workspace)
    return roots


def is_under_any_root(path, roots):
    abspath = os.path.abspath(path)
    return any(
        abspath == root or abspath.startswith(root.rstrip(os.sep) + os.sep)
        for root in roots
    )
