# e2e-tests

End-to-end tests that drive the real UI (`ui/`) in a real browser via
Playwright, plus a set of direct-API regression tests for server behavior
the UI's own client-side checks would otherwise mask (e.g. it disables the
"add comment" button on an empty body client-side, so a browser-only test
would never notice if the *server* stopped rejecting one too).

## Prerequisites

This suite does not stand up the backend or database itself — only the
Vite dev server (via Playwright's `webServer`, reusing it if already
running). Before running tests, from the repo root:

```bash
pnpm db:up                          # Postgres, once
cd server-kotlin && ./gradlew bootRun   # the backend on :3200, which
                                        # ui/vite.config.ts's /api proxy targets
```

## Running

From the repo root:

```bash
pnpm test:e2e
```

Or from this directory:

```bash
pnpm test:e2e          # headless
pnpm test:e2e:headed   # see the browser
pnpm test:e2e:ui       # Playwright's interactive UI mode
```

## What's covered

- `tests/board.spec.ts` — real browser walkthrough: the board loads and
  auto-selects the existing project/team, a task can be created and
  assigned a role, and status-transition buttons only ever offer the
  transitions `TASK_STATUS_TRANSITIONS` actually allows (not just
  disabled — genuinely absent from the DOM).
- `tests/api-regression.spec.ts` — direct API checks for `/health` and for
  validation that must be enforced server-side regardless of what the UI
  currently prevents a user from doing (negative budgets, empty comments,
  invalid status transitions, self-referential task dependencies).

## Notes on test data

Projects, teams, and repositories have no delete endpoint (by design, same
as the original Node server), so `tests/fixtures.ts` reuses whatever
project/team already exists rather than creating fresh ones per run. Tasks
*do* support deletion — tests that create their own scratch tasks clean
them up in `afterEach`/inline `DELETE` calls.
