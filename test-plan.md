# Test plan — Expand should open a page for the task not a dialog

Task `e5a09874-5562-4992-a138-9ad47be0675d` (story).

The task shipped with **no acceptance criteria** — the description just repeats
the title. Criteria below are inferred from the title and the implementation.

## Inferred acceptance criteria

1. The board card's "Expand" navigates to a task URL instead of opening a modal.
2. It is a real link (`<a href>`), so copy-link / open-in-new-tab work.
3. No `role="dialog"` remains; the board is replaced, not overlaid.
4. The URL is deep-linkable and survives a reload.
5. Browser Back returns to the board (the modal used to leave the app entirely).
6. An explicit way back to the board exists on the page.
7. The page shows at least what the modal showed: title, type, status,
   description, and the latest run's status line + transcript (or a
   "not been run yet" state).
8. Ids that do not resolve, and load failures, degrade to a message — never a
   permanent "Loading…".
9. The new route does not shadow the existing `/projects/:projectId/:section?`
   routes.

## Test cases

Environment: Postgres + `server-kotlin` on :3200 + UI dev server on :5173.
Playwright, `e2e-tests/`.

| # | Case | Expected | Covered by |
|---|------|----------|-----------|
| 1 | Click Expand on a board card | URL becomes `/projects/:projectId/tasks/:taskId`; task heading visible; zero `role="dialog"`; board's "+ New Task" gone | `board.spec.ts` |
| 2 | Reload that URL | Still lands on the task | `board.spec.ts` |
| 3 | Click "← Board" | Returns to `/projects/:projectId/board` | `board.spec.ts` |
| 4 | Browser Back after Expand | Returns to the board, still inside the app | `task-page.spec.ts` |
| 5 | Cold deep link to a never-run task | Heading + "This task has not been run yet."; no dialog | `task-page.spec.ts` |
| 6 | Unknown task id | "Task not found." + ← Board, not a spinner | `task-page.spec.ts` |
| 7 | Unknown project id (resolves to no team) | Does not hang on "Loading…" | `task-page.spec.ts` |
| 8 | **Expand is a real anchor** | `href` equals the task path and `tagName === "A"` — a `<button>` + `navigate()` would pass cases 1–3 | `task-page-qa.spec.ts` |
| 9 | **Task with a run** | Status line renders status, duration (`4.2s`), cost (`$0.1234`); transcript mounts; no "not been run yet" | `task-page-qa.spec.ts` |
| 10 | **Description rendering** | Task description is visible on the page | `task-page-qa.spec.ts` |
| 11 | **Route shadowing** | `/projects/:id/board` and `/projects/:id/repositories` still render their own sections | `task-page-qa.spec.ts` |
| 12 | **Task deleted while page is open** | Polled list drops it → "Task not found.", no ghost | `task-page-qa.spec.ts` |
| 13 | **Teams/tasks request errors (500)** | "Could not load this task." + ← Board, never a permanent "Loading…" | `task-page-qa.spec.ts` |

Bold rows are the gaps QA added; the rest were already covered by the
Engineer's commits.

## Results

Full suite, run against the real stack:

```
25 passed, 1 skipped (pre-existing, unrelated: "rejects an empty task comment body")
```

Case 13 **failed on first run** — the page sat on "Loading…" indefinitely. Fixed
in commit `1e73580`; re-run passes. All other cases passed on first run.

`pnpm -r typecheck` clean across `packages/shared`, `ui`, `e2e-tests`.
