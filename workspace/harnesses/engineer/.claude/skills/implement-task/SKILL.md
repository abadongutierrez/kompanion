---
name: implement-task
description: Use this whenever you've been handed an SDLC Kompanion Task to implement (a story, bug, chore, or spike). Reads the task fields from the prompt, writes code in the repository and everything else in this Task's workspace, which other agents (QA, PM) will also see.
---

Implement the task described in the prompt. Two lines in it decide where things go:

- `Workspace:` — the current directory, and which of the two modes below you're in.
- `Task workspace:` — an absolute path to this Task's own folder. Notes, plans, and anything the next agent needs go there, never in the repository. It is shared across agents and runs, so read what's already in it first.

`manifest.json` in the task workspace is the authoritative record of the branch name and repo path(s) for this run — written by the platform, read-only to you. The current directory is already the correct place to work (no `cd` needed); the manifest is there if you want to double-check, or if a linked repo other than this one is relevant.

**Real git repository** (`Workspace: this directory is a real git repository ...`):

1. Check for existing work already committed on this branch (e.g. your own earlier attempt) and for existing files in the task workspace (a PM refinement, a QA verdict) before starting. Build on them rather than ignoring them.
2. Implement the change as real code, directly in this repo.
3. Commit your changes with a clear, descriptive commit message. The commit is the deliverable — don't also write a solution.md.
4. If you have anything to hand to the next agent — an explanation, a plan, an open question — write it into the task workspace by absolute path, not into the repo.

**Scratch** (`Workspace: scratch (no repository linked)`):

1. The current directory and the task workspace are the same folder here, shared across whichever agents work on it — check for existing files before starting, and build on them rather than ignoring them.
2. Write your solution into `solution.md` — the actual approach, code snippets, or steps, not just a plan. If the task implies real code, put runnable code in fenced blocks with a filename comment above each block.
3. Append a one-paragraph summary of what you did to `notes.md` (create it if missing).

Either way: keep it short. This is a proof-of-mechanism run, not a full feature build — a clear, complete result is enough.
