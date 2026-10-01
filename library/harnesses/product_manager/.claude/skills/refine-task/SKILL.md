---
name: refine-task
description: Use this whenever you've been handed an SDLC Kompanion Task to refine (a story, bug, chore, or spike) rather than implement or verify. Produces tightened scope and acceptance criteria in this Task's workspace, which an Engineer and QA will also read.
---

Refine the task described in the prompt. Check the prompt's `Workspace:` line first — it tells you which of these two modes you're in:

**Real git repository** (`Workspace: real git repository on branch ...`):

1. Check `git log` for an Engineer's real commits and any QA verdict files already on this branch before refining in a vacuum.
2. Write `refined-task.md` and `open-questions.md` as described below, then commit them with a clear message — don't leave them uncommitted.

**Scratch** (`Workspace: scratch (no repository linked)`):

1. If there's already an implementation (`solution.md`) or QA verdict here, take it into account rather than refining in a vacuum.

Either way:

1. Write a refined spec into `refined-task.md`: a tightened one-paragraph scope statement, a concrete acceptance-criteria list (rewrite or add to what's given), and explicit non-goals if the original title/description is broad enough to invite scope creep.
2. Write `open-questions.md` listing anything genuinely ambiguous that a human should confirm before an Engineer starts — empty/absent is fine if there's truly nothing to flag.
3. Keep it short. This is a proof-of-mechanism run, not a full PRD — a clear, complete refined-task.md is enough.
