# Requirements — Library and workspace roots

Roadmap item: "Library and workspace roots" (`specs/roadmap.md`).

## Problem

`WORKSPACE_ROOT` (default `<repo>/workspace`) holds two different things:

- **Templates**, tracked in git: `harnesses/`, `hooks/`, `pi/`.
- **Runtime data**, ignored by git: `projects/<slug>-<id8>/tasks/<taskId>/`
  and the legacy `tasks/`.

Mixing them causes trouble:

- Run the server from a git worktree and the root becomes that worktree's
  `workspace/`. It has no `projects/`, so the server builds a second, empty
  workspace.
- Runtime data sits next to files you edit and review.
- Upcoming work (the skills library and stored agent instances) adds more
  generated data and more templates. They need separate homes.

This follows mission principle 2 (the Task folder is the record) and
principle 6 (spec first).

## Scope

In:

1. A new tracked folder `library/` at the repo root, holding `harnesses/`,
   `hooks/` and `pi/`. They move out of `workspace/`.
2. A new setting `LIBRARY_ROOT`, defaulting to the repo's `library/`.
3. `WORKSPACE_ROOT` now holds only generated and copied files. Its default
   changes to `$HOME/.kompanion/workspace`.
4. Two path rules instead of one (see Decisions 4).
5. A script, `bin/migrate-workspace`, that moves the existing runtime data and
   updates the database.
6. Docs and `.env.example` describe the new roots.

Out:

- The skills library, `library/skills/`, and agent instances. They build on
  this work and get their own spec.
- Any server code that reads the old location. The script moves the data
  once, so there is no fallback.
- Windows paths. WSL and Linux only, like today.
- Multi-user setups. One operator, one machine (mission).

## Decisions

1. **Names.** `library/` for templates, `LIBRARY_ROOT` for its setting.
   `WORKSPACE_ROOT` keeps its name.
2. **`library/` contents.** `harnesses/`, `hooks/`, `pi/`, moved with
   `git mv` so history follows. `skills/` is added by the skills spec.
3. **Defaults.**
   - `LIBRARY_ROOT`: `<repo root>/library`, resolved from the server's
     working directory the same way as today (parent of `server-kotlin/`).
   - `WORKSPACE_ROOT`: `$HOME/.kompanion/workspace`, taken from the
     `user.home` property. The server creates it on boot. If the home folder
     cannot be found, the server stops with a message telling the operator to
     set `WORKSPACE_ROOT`.
4. **Two path rules.** Today one pair of functions (`resolveHarnessPath` and
   `toStoredPath` in `ClaudeHarnessService`) serves both Agents and Projects.
   That only works while both roots are the same folder. Split them:
   - `agents.harness_path`: absolute, or relative to `LIBRARY_ROOT`.
   - `projects.workspace_path`: absolute, or relative to `WORKSPACE_ROOT`.

   The stored strings do not change. `harnesses/engineer` is the same text
   under either root, because `library/` keeps the `harnesses/` subfolder.
   `projects/acme-1a2b3c4d` is the same too.
5. **Where each piece is read from.**
   - Harness folders, hook scripts (`WorkspaceEnforcementService`) and the pi
     extension (`piExtensionFile`) are read from `LIBRARY_ROOT`.
   - Project workspaces, task folders, `manifest.json` and logs are written
     under `WORKSPACE_ROOT`.
   - The runners keep copying from the harness folder into the run. Nothing
     is written into `library/`.
6. **Legacy `tasks/`.** `legacyWorkspacesRoot` stays, now pointing at
   `<WORKSPACE_ROOT>/tasks`. The script moves the old folder there, so the
   existing V21 fallback keeps working and needs no new code.
7. **Migration script, `bin/migrate-workspace`.** Not a Flyway migration,
   because the old absolute path differs per machine.
   - Dry run by default. `--apply` does the work.
   - It refuses to run while the server is up (port 3200 answers).
   - It moves `<repo>/workspace/projects` and `<repo>/workspace/tasks` into
     the new `WORKSPACE_ROOT`. It never overwrites: if a destination folder
     already has content, it stops and says so.
   - It updates the database through `docker exec` into the dev Postgres
     container, like `bin/db-reset`. Rows in `agents.harness_path` and
     `projects.workspace_path` that hold an absolute path inside the old
     `<repo>/workspace/` become relative. Relative rows are left alone. Absolute
     paths outside the old root are left alone and listed in the report.
   - Before changing rows, it writes the old values to a backup file in the
     new root (`migration-backup-<timestamp>.sql`), so the change can be
     undone.
   - It prints what it moved and changed. It is safe to run twice.
8. **`.gitignore`.** The `workspace/tasks/` and `workspace/projects/` rules
   are removed in the last stage, after the operator has run the script.
   Until then the data is still in the repo folder and must stay ignored.
9. **No behavior change for agents.** Confinement, `manifest.json`, the
   prompt lines and the runtime layouts stay as they are. Only where files
   come from and go to changes.

## Context

- `ClaudeHarnessService` resolves the root. About 15 files touch these
  roots: `FileHarnesses`, `ProjectController`, `AgentController`,
  `WorkspaceEnforcementService`, `PiRunner`, `Entities`, `Requests`,
  `AgentUseCasesTest`, `ClaudeHarnessServiceTest`, `packages/shared/src/domain.ts`,
  `.env.example`, `README.md`, `AGENTS.md`, `DESIGN.md`,
  `docs/agent-runtimes.md`.
- Earlier path migrations: V14 (harness path relative to the root), V16
  (stripped the old absolute prefix), V21 (project workspace path and the
  legacy `tasks/` fallback). This work follows their pattern but moves the
  data with a script.
- Running the server from a worktree is a normal case. With the new defaults
  that gives the right result: templates come from that checkout's
  `library/`, runtime data comes from the one shared `~/.kompanion/workspace`.
- `docs/agent-runtimes.md` calls the harness "the Agent's template folder.
  Read-only input". This work keeps that true: `library/` is read-only input.

## Risks

- A database row with an absolute path outside the old root keeps pointing
  there. The script lists these. The operator fixes them by hand.
- The move is the one step that can lose data. Mitigations: dry run first,
  never overwrite, move (same filesystem, instant) and not copy-then-delete.
  If `$HOME` is on a different filesystem the move becomes a copy, and the
  script copies and verifies the file count before it removes the source.
- Other checkouts of the repo that still hold their own `workspace/` data are
  not touched. The script handles the checkout it runs from.
