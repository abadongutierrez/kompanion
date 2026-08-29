---
name: implement-task
description: Use this whenever you've been handed an SDLC Paperclip Task to implement (a story, bug, chore, or spike). Reads the task fields from the prompt and produces a concrete solution in the current directory — this Task's shared workspace, which other agents (QA, PM) will also see.
---

Implement the task described in the prompt. Check the prompt's `Workspace:` line first — it tells you which of these two modes you're in. If a `manifest.json` exists in the current directory, it's the authoritative record of the branch name and repo path(s) for this run — written by the platform, not something you need to compute yourself; the current directory is already the correct place to work (no `cd` needed), the manifest is just there if you want to double-check or if a linked repo other than this one is relevant.

**Real git repository** (`Workspace: this directory is a real git repository ...`):

1. Check for existing work already committed on this branch (e.g. your own earlier attempt) and for existing files in the task workspace (a PM refinement, a QA verdict) before starting. Build on them rather than ignoring them.
2. Implement the change as real code, directly in this repo.
3. Commit your changes with a clear, descriptive commit message. The commit is the deliverable — don't also write a solution.md.

**Scratch** (`Workspace: scratch (no repository linked)`):

1. The current directory and the task workspace are the same folder here, shared across whichever agents work on it — check for existing files before starting, and build on them rather than ignoring them.
2. Write your solution into `solution.md` — the actual approach, code snippets, or steps, not just a plan. If the task implies real code, put runnable code in fenced blocks with a filename comment above each block.
4. If you have anything to hand to the next agent — an explanation, a plan, an open question — write it into the task workspace by absolute path, not into the repo.
3. Append a one-paragraph summary of what you did to `notes.md` (create it if missing).

Either way: keep it short. This is a proof-of-mechanism run, not a full feature build — a clear, complete result is enough.
