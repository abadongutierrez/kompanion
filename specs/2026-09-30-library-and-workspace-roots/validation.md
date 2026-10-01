# Validation — Library and workspace roots

The work can merge when every item in "Merge bar" is true.

## Merge bar

Automated tests pass:

- `cd server-kotlin && ./gradlew test` is green, including these new or
  updated tests:
  - `LIBRARY_ROOT` unset: the library root is `<repo>/library`.
  - `LIBRARY_ROOT` set: the override wins.
  - `WORKSPACE_ROOT` unset: the root is `$HOME/.kompanion/workspace`, and the
    folder is created.
  - `WORKSPACE_ROOT` set: the override wins.
  - A harness path inside the library is stored relative
    (`harnesses/engineer`). One outside is stored as given.
  - A project workspace path inside the workspace root is stored relative.
    One outside is stored as given.
  - Library paths and workspace paths resolve against different roots.
  - Hook scripts and the pi extension resolve under the library root.
  - A task that exists only under `<WORKSPACE_ROOT>/tasks/<id>` still resolves
    through the legacy fallback.
- `pnpm -C packages/shared test` is green.
- The shell test for `bin/migrate-workspace` (run by `bin/test`) is green:
  - Dry run changes nothing.
  - `--apply --skip-db` moves `projects/` and `tasks/`.
  - A second run does nothing.
  - A non-empty destination stops the script with a message, and nothing is
    moved.
  - A running server (port 3200 answering) stops the script.

Repository state:

- `workspace/harnesses`, `workspace/hooks` and `workspace/pi` no longer exist.
  `library/harnesses`, `library/hooks` and `library/pi` do, and `git log
  --follow` still shows their history.
- `git status` is clean after a fresh checkout and a server boot. No runtime
  data appears as untracked.
- Search finds no remaining code that reads templates from `workspace/`:
  `grep -rn "workspace/harnesses\|workspace/hooks\|workspace/pi" server-kotlin
  library docs README.md AGENTS.md DESIGN.md specs` shows only historical
  mentions that say so.

Docs match the code:

- `README.md`, `AGENTS.md`, `DESIGN.md`, `docs/agent-runtimes.md`,
  `specs/tech-stack.md` and `.env.example` describe `library/`, `LIBRARY_ROOT`
  and the new `WORKSPACE_ROOT` default.
- `specs/roadmap.md` lists the item under "Done".

## Not part of the merge bar

These were considered and left out on purpose. They are still worth doing.

- A real task run on each runtime (Claude Code, pi, opencode), checking that
  the harness loads, the hooks fire and the task folder lands in
  `~/.kompanion/workspace`.
- The Playwright suite (`pnpm -C e2e-tests test:e2e`).
- Running `bin/migrate-workspace --apply` against the real database. That is
  the operator's step after merge, and needs the dev Postgres container.

If a later change breaks something these would have caught, add the check to
the bar then.
