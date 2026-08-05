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


def load_allowed_roots():
    # TASK_WORKSPACE_DIR is set on the claude process's own environment at
    # spawn time and inherited by subprocesses (confirmed: hook/command
    # subprocesses inherit the parent process's env) — manifest.json lives
    # there, not under either script's own directory.
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
