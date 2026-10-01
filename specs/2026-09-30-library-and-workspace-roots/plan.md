# Plan — Library and workspace roots

Two stages, one PR, separate commits. After each stage the app still works.
See `requirements.md` for the decisions behind each step.

## Stage 1 — Library root

### 1. Split the path rules

- Add `libraryRoot` to `ClaudeHarnessService`, from `LIBRARY_ROOT`, defaulting
  to `<parent of server-kotlin>/library`.
- Replace `resolveHarnessPath` and `toStoredPath` with two pairs:
  - `resolveLibraryPath` and `toStoredLibraryPath`, relative to `libraryRoot`.
  - `resolveWorkspacePath` and `toStoredWorkspacePath`, relative to
    `workspaceRoot`.
- `harnessesRoot` and `listBuiltinHarnesses` use `libraryRoot`.
- In stage 1 `workspaceRoot` is unchanged, so only the template reads move.

### 2. Move callers to the right rule

- `FileHarnesses` and `AgentController` (reads and writes the harness
  `CLAUDE.md`): library rules.
- `ProjectController` (project workspace path): workspace rules.
- `WorkspaceEnforcementService`: `hooksSrcDir` and `piExtensionFile` read from
  `libraryRoot`.
- `PiRunner` and its comments: point at the library pi extension.
- Update the comments in the files that name `workspace/harnesses`.

### 3. Move the templates

- `git mv workspace/harnesses workspace/hooks workspace/pi library/`.
- Search the harness files, hooks and docs for text that says `workspace/`
  and fix the ones that mean the library.
- Check `.gitignore` and `workspace/pi/` rules (`pi-agent/.gitignore`) still
  apply after the move.

### 4. Tests for stage 1

- Update `ClaudeHarnessServiceTest` and `AgentUseCasesTest` to the new
  functions.
- Add tests: library default, `LIBRARY_ROOT` override, a library path is
  stored relative, an absolute path outside the library is stored as given,
  hooks and the pi extension resolve under the library.
- Run `./gradlew test`. Commit stage 1.

## Stage 2 — Workspace root

### 5. New workspace default

- `workspaceRoot` defaults to `$HOME/.kompanion/workspace` (`user.home`),
  overridden by `WORKSPACE_ROOT`.
- Create the folder on boot. If `user.home` is missing and `WORKSPACE_ROOT`
  is not set, fail startup with a clear message.
- `legacyWorkspacesRoot` stays `<workspaceRoot>/tasks`.
- Update `ClaudeHarnessServiceTest`: default location, override, legacy
  lookup under the new root.

### 6. The migration script

- Write `bin/migrate-workspace`, in the style of the other `bin/` scripts.
- Dry run by default, `--apply` to act, `--skip-db` to move files only.
- Steps, in order:
  1. Refuse if port 3200 answers.
  2. Find the old root (`<repo>/workspace`) and the new root
     (`WORKSPACE_ROOT` or the default).
  3. Report what would move. Stop if a destination folder has content.
  4. Move `projects/` and `tasks/`. Across filesystems, copy, verify the file
     count, then remove the source.
  5. Write the backup file with the old values of the rows to change.
  6. Update `agents.harness_path` and `projects.workspace_path` through
     `docker exec` into the Postgres container (db, user and password
     `sdlc`). Absolute paths inside the old root become relative.
  7. Print a report: moved folders, changed rows, left-alone rows.
- Document it in `bin/README.md`.

### 7. Tests for the script

- Add a shell test that runs the script with `--skip-db` against temporary
  folders: dry run changes nothing, `--apply` moves, a second run is a no-op,
  a non-empty destination stops it.
- Hook it into `bin/test`.

### 8. Clean up

- Remove the `workspace/tasks/` and `workspace/projects/` rules from
  `.gitignore`.
- Update `.env.example` (both roots, new defaults).
- Update `README.md` (layout table), `AGENTS.md` (workspaces section),
  `DESIGN.md`, `docs/agent-runtimes.md` and `specs/tech-stack.md` (harness
  location).
- Move the item from "Next" to "Done" in `specs/roadmap.md`.
- Run `./gradlew test` and `pnpm -C packages/shared test`. Commit stage 2.

## After merge (operator, not part of the PR)

- Stop the server, run `./bin/migrate-workspace` (dry run), then
  `./bin/migrate-workspace --apply`, then start the server.
- Delete the now empty `<repo>/workspace/` folder.
