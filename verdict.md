# Verdict — Expand should open a page for the task not a dialog

Task `e5a09874-5562-4992-a138-9ad47be0675d` (story). QA review + merge.

## PASS (after one fix)

An implementation exists and was verified by running it, not by reading it.

## Are the acceptance criteria sufficient?

**No.** The task shipped with no acceptance criteria — the description is a
verbatim copy of the title. Everything in `test-plan.md` is inferred. The title
states what to remove (a dialog) but never says what the page must *contain*,
so "did we lose anything?" was not answerable from the task. I resolved it by
diffing the deleted `TaskExpandedView.tsx` against the new `TaskPage.tsx`:
title, type, status, description, run status line and transcript all carry
over, and the modal's Escape/Close is replaced by "← Board" plus real browser
Back. **No content regression.**

## What was verified

- Engineer's change: commits `bfc3779` (Expand → `<Link>` to a new
  `/projects/:projectId/tasks/:taskId` route, `TaskExpandedView` deleted) and
  `7b98906` (no-team case no longer hangs).
- The dev server on :5173 runs from the main checkout, not this worktree. I
  confirmed `TaskPage.tsx`, `TaskBoard.tsx` and `App.tsx` were byte-identical
  there and that `TaskExpandedView.tsx` was gone, so the e2e run exercises this
  branch's code.
- Full Playwright suite: **25 passed, 1 skipped** (pre-existing, unrelated).
- `pnpm -r typecheck` clean.

## Defect found and fixed

**The task page could still hang on "Loading…" forever.** Commit `7b98906`
fixed that symptom only for a project with no team, via
`teams.data.length === 0` — which requires the request to have *succeeded*. If
the teams or tasks request errors instead (API down, 500), `data` stays
undefined permanently, so neither the task branch nor the not-found branch can
resolve. Same dead end, different path.

Reproduced with a 500 intercept on `/api/projects/:id/teams`: the page sat on
"Loading…" for the full 20s timeout. Fixed in `1e73580` by adding an `isError`
branch that reuses the back-to-board link; test case 13 now passes.

## Flagged, not fixed (out of scope)

- **The page is read-only.** The board card offers Comments, Dependencies, Edit
  and "Run with Claude"; the task page offers none. This is *not* a regression —
  the deleted modal had none of them either — but a dedicated task page is where
  a user will expect them. Worth a follow-up story; deciding it is a product
  call, not QA's.
- `/projects/:id/tasks` with no task id falls through to the `:section?` route
  as `section="tasks"`. Renders the shell with no section content — harmless,
  no crash, and pre-existing behaviour for any unknown section.
- A note on `queryKey: ["taskRuns", taskId]` omitting the team id was raised
  during review. Not a real issue: task ids are UUIDs and globally unique, and
  the key matches `TaskCard`'s, so the shared cache entry is correct.

## Merge

Merged into local `main` as `3faaeee`, per the Operator's "@qa review and
merge". Note `main` has diverged from `origin/main` (unrelated histories) and
carries unrelated uncommitted harness edits; **nothing was pushed**.
