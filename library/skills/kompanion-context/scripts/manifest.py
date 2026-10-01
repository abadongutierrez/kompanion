#!/usr/bin/env python3
"""
Reads this run's manifest.json and prints one fact from it. Read-only: it
never writes a file. The manifest is written by the server before every run
and is the single source of truth for where the agent is working; this just
saves the agent from locating and parsing it.

Usage:
  manifest.py worktree         the folder you work and commit in
  manifest.py task-workspace   your own folder for this task: plans, notes,
                               handoff files. Shared with the other agents.
  manifest.py branch           the task's git branch (nothing if no repo is linked)
  manifest.py repos            every linked repo as JSON: role, name, repo, worktree
  manifest.py roots            every folder you may write in, one per line

The manifest is found through $TASK_WORKSPACE_DIR, which the server sets for
every run. Standard library only.
"""
import json
import os
import sys

COMMANDS = ("worktree", "task-workspace", "branch", "repos", "roots")


def fail(message):
    print(f"manifest.py: {message}", file=sys.stderr)
    sys.exit(2)


def load():
    folder = os.environ.get("TASK_WORKSPACE_DIR")
    if not folder:
        fail("TASK_WORKSPACE_DIR is not set — this is not running inside a task.")
    path = os.path.join(folder, "manifest.json")
    try:
        with open(path) as f:
            return json.load(f)
    except OSError as e:
        fail(f"cannot read {path} ({e.strerror}).")
    except json.JSONDecodeError as e:
        fail(f"{path} is not valid JSON ({e}).")


def roots(manifest):
    # Same derivation as the enforcement hooks: the worktrees, then the task
    # folder, without repeating one. In scratch mode they are the same folder.
    found = [manifest["primary"]["workspaceLocalPath"]]
    found += [r["workspaceLocalPath"] for r in manifest.get("otherRepos", [])]
    task = manifest.get("taskWorkspace")
    if task and task not in found:
        found.append(task)
    return found


def repos(manifest):
    primary = manifest["primary"]
    entries = [("primary", primary)] + [("other", r) for r in manifest.get("otherRepos", [])]
    return [
        {
            "role": role,
            "name": entry.get("name"),
            "repo": entry.get("repositoryLocalPath"),
            "worktree": entry["workspaceLocalPath"],
        }
        for role, entry in entries
    ]


def main(argv):
    if len(argv) != 2 or argv[1] not in COMMANDS:
        fail(f"usage: manifest.py {{{'|'.join(COMMANDS)}}}")
    command = argv[1]
    manifest = load()

    try:
        if command == "worktree":
            print(manifest["primary"]["workspaceLocalPath"])
        elif command == "task-workspace":
            print(manifest["taskWorkspace"])
        elif command == "branch":
            if manifest.get("branchName"):
                print(manifest["branchName"])
        elif command == "repos":
            print(json.dumps(repos(manifest), indent=2))
        elif command == "roots":
            print("\n".join(roots(manifest)))
    except KeyError as e:
        fail(f"manifest.json has no {e} — it may be from an older version of the server.")


if __name__ == "__main__":
    main(sys.argv)
