#!/usr/bin/env python3
"""
Checks that everything a Kompanion run needs is in place before the agent
starts the real work. Read-only: it never writes a file.

Usage:
  preflight.py          run every check, print one line per check

Each line starts with `ok`, `warn` or `FAIL`. The exit code is 0 when nothing
failed (warnings are allowed) and 1 when a check failed. A usage error exits 2.

Checks, in order:
  - TASK_WORKSPACE_DIR is set and its manifest.json is readable, valid JSON,
    and has the fields this script needs
  - the task workspace exists and is writable
  - the current folder is inside one of the allowed roots
  - every worktree in the manifest exists and is writable
  - repository mode only: each worktree is a git work tree, the primary one
    is on the manifest's branch, it has a git user to commit with, and its
    working tree is clean (dirty is only a warning)

Standard library only.
"""
import json
import os
import subprocess
import sys


class Report:
    def __init__(self):
        self.failed = 0
        self.warned = 0

    def ok(self, message):
        print(f"ok    {message}")

    def warn(self, message):
        self.warned += 1
        print(f"warn  {message}")

    def fail(self, message):
        self.failed += 1
        print(f"FAIL  {message}")


def git(folder, *args):
    try:
        done = subprocess.run(
            ["git", "-C", folder, *args], capture_output=True, text=True, timeout=30
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        return None, str(e)
    if done.returncode != 0:
        return None, done.stderr.strip()
    return done.stdout.strip(), None


def inside(path, root):
    path, root = os.path.realpath(path), os.path.realpath(root)
    return path == root or path.startswith(root.rstrip(os.sep) + os.sep)


def load_manifest(report):
    folder = os.environ.get("TASK_WORKSPACE_DIR")
    if not folder:
        report.fail("TASK_WORKSPACE_DIR is not set — this is not running inside a task.")
        return None
    path = os.path.join(folder, "manifest.json")
    try:
        with open(path) as f:
            manifest = json.load(f)
    except OSError as e:
        report.fail(f"cannot read {path} ({e.strerror}).")
        return None
    except json.JSONDecodeError as e:
        report.fail(f"{path} is not valid JSON ({e}).")
        return None
    missing = [k for k in ("primary", "taskWorkspace") if not manifest.get(k)]
    if not missing and not manifest["primary"].get("workspaceLocalPath"):
        missing.append("primary.workspaceLocalPath")
    if missing:
        report.fail(f"manifest.json has no {', '.join(missing)} — it may be from an older server.")
        return None
    report.ok(f"manifest.json read from {folder}")
    return manifest


def check_folder(report, label, path):
    if not os.path.isdir(path):
        report.fail(f"{label} {path} does not exist.")
        return False
    if not os.access(path, os.W_OK):
        report.fail(f"{label} {path} is not writable.")
        return False
    report.ok(f"{label} {path} exists and is writable")
    return True


def check_repo(report, label, worktree, branch=None):
    top, err = git(worktree, "rev-parse", "--show-toplevel")
    if top is None:
        report.fail(f"{label} {worktree} is not a git work tree ({err}).")
        return
    report.ok(f"{label} is a git work tree")
    if branch is None:
        return

    current, _ = git(worktree, "rev-parse", "--abbrev-ref", "HEAD")
    if current == branch:
        report.ok(f"on branch {branch}")
    else:
        report.fail(f"on branch {current or '(unknown)'}, but the task's branch is {branch}.")

    name, _ = git(worktree, "config", "user.name")
    email, _ = git(worktree, "config", "user.email")
    if name and email:
        report.ok(f"git user is {name} <{email}>")
    else:
        report.fail("no git user.name or user.email is set, so a commit would fail.")

    status, _ = git(worktree, "status", "--porcelain")
    if status:
        count = len(status.splitlines())
        report.warn(f"the working tree has {count} uncommitted change(s) — check they are yours.")
    elif status is not None:
        report.ok("the working tree is clean")


def main(argv):
    if len(argv) != 1:
        print("usage: preflight.py", file=sys.stderr)
        sys.exit(2)

    report = Report()
    manifest = load_manifest(report)
    if manifest is not None:
        primary = manifest["primary"]
        others = manifest.get("otherRepos") or []
        task = manifest["taskWorkspace"]
        worktrees = [primary["workspaceLocalPath"]] + [r.get("workspaceLocalPath") for r in others]
        roots = [w for w in worktrees if w] + [task]

        check_folder(report, "task workspace", task)

        cwd = os.getcwd()
        if any(inside(cwd, r) for r in roots):
            report.ok(f"current folder {cwd} is inside an allowed root")
        else:
            report.fail(f"current folder {cwd} is outside every allowed root.")

        repo_mode = bool(primary.get("repositoryLocalPath"))
        if not repo_mode:
            report.ok("scratch mode: no repository is linked")
        if check_folder(report, "worktree", primary["workspaceLocalPath"]) and repo_mode:
            branch = manifest.get("branchName")
            if not branch:
                report.fail("a repository is linked but the manifest names no branch.")
            check_repo(report, "worktree", primary["workspaceLocalPath"], branch or None)
        for other in others:
            path = other.get("workspaceLocalPath")
            name = other.get("name") or "linked repo"
            if not path:
                report.fail(f"{name} has no worktree path in the manifest.")
            elif check_folder(report, f"{name} worktree", path):
                check_repo(report, f"{name} worktree", path)

    print()
    if report.failed:
        print(f"preflight: {report.failed} check(s) failed, {report.warned} warning(s). Do not start the work.")
        sys.exit(1)
    print(f"preflight: ready, {report.warned} warning(s).")


if __name__ == "__main__":
    main(sys.argv)
