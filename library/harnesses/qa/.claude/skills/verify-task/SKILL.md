---
name: verify-task
description: Use this whenever you've been handed an SDLC Kompanion Task to verify (a story, bug, chore, or spike) rather than implement. Produces a test plan and a pass/fail assessment in this Task's workspace, verified against an Engineer's actual implementation.
---

Verify the task described in the prompt. Check the prompt's `Workspace:` line first — it tells you which of these two modes you're in:

**Real git repository** (`Workspace: real git repository on branch ...`):

1. Look at `git log`/`git diff` on this branch for an Engineer's actual committed change. If nothing's been committed yet, say so plainly rather than fabricating a verdict.
2. Run the real code for real — don't just read it. Add and commit any test files you write.
3. Write your test plan and verdict as described below, into `test-plan.md`/`verdict.md` in the task workspace (the `Task workspace:` line in the prompt, by absolute path) — not into the repo, which should only ever gain real test code.

**Scratch** (`Workspace: scratch (no repository linked)`):

1. Look for an Engineer's `solution.md` here first — verify against what was actually written, not a hypothetical. If nothing has been implemented yet, say so plainly rather than fabricating a verdict.

Either way:

1. Write a concrete test plan into `test-plan.md` in the task workspace: concrete test cases derived from the acceptance criteria (or your best inference if criteria are missing), covering the happy path and at least one edge case.
2. Write your assessment into `verdict.md`, next to it: state clearly whether the acceptance criteria, as written, are sufficient to verify the task, whether an implementation exists to test against, and flag anything ambiguous or untestable.
3. Keep it short. This is a proof-of-mechanism run, not a full test suite — a clear, complete test-plan.md and verdict.md are enough.
