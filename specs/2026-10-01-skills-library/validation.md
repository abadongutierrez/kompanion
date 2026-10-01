# Validation — Skills library

The work can merge when every item under "Merge bar" is true.

## Merge bar

### Automated tests pass

`cd server-kotlin && ./gradlew test` is green, with these new or updated
tests. Postgres must be running for the context-load test.

Skills:

- Registering a valid folder stores its slug, name, description and a path
  relative to `LIBRARY_ROOT`. An absolute path outside the library is stored
  as given.
- A folder with no `SKILL.md`, or a `SKILL.md` without `name` or
  `description`, is refused with a clear message.
- A duplicate slug is refused.
- Scan registers new valid folders, refreshes existing rows, marks a row with
  a missing folder as broken, and never deletes a row.
- Unregistering a skill that is assigned returns 409 and names the Agents.
  Unregistering an unassigned skill removes only the row, not the folder.

Assignment:

- `PUT` replaces the set: skills not in the list are removed, new ones added.
- An unknown skill id is refused.
- `GET` reports status and the "harness already has it" flag.
- The Agent response is unchanged.

Agent instances:

- The same harness and skills give the same hash. Changing one byte changes
  it. File order and timestamps do not.
- A second build with the same content reuses the stored folder.
- The instance holds only the chosen runtime's layout, and the library skill
  lands in the right folder for `claude_code`, `pi` and `opencode`.
- pi's `auth.json`, `models-store.json`, `trust.json`, `sessions/` and
  `npm/` are not in the instance.
- A skill whose slug the harness already has is skipped and recorded as
  `skipped_harness_has_it`. A skill with a missing folder is skipped and
  recorded as `missing`. In both cases the run goes on.
- `git_sha` and `git_dirty` are set inside a git repo, and null outside one.
  A change in a skill folder makes `git_dirty` true.

Runs:

- Each runner's `prepareWorkspace` builds its cwd from the instance. An Agent
  with no skills produces exactly the files it produced before this work.
- A run row stores `instance_hash`, `git_sha`, `git_dirty`, and one
  `task_run_skills` row per skill with its slug, hash and outcome.
- The existing `PiRunner`, `OpencodeRunner` and `ClaudeCodeRunner` tests
  still pass.

Schema:

- `V22` applies on top of V21, and all migrations run in the context-load
  test.

`kompanion-context`:

- The shell test for `scripts/manifest.py` passes: each command prints the
  right value from a sample manifest, a missing manifest and an unknown
  command give a clear error and a non-zero exit, and the script writes
  nothing.

### Shared tests pass

`pnpm -C packages/shared test` is green, including the new schemas for
skills, an Agent's skills, and a run's agent instance.

### E2E suite passes

`pnpm -C e2e-tests test:e2e` is green against the full stack, including the
new skills spec:

- Register a skill by path, and see it in the list.
- Scan finds a new folder.
- Assign a skill in the Agent form, save, reload, and see it still ticked.
- Unregistering an assigned skill shows the refusal.
- The new spec leaves no skill rows or folders behind.

### Repository state

- `git status` is clean after a fresh checkout and a server boot.
- `V22` is the only new migration, and no applied migration changed.
- No new dependency in `server-kotlin/build.gradle.kts`, `ui/package.json` or
  `packages/shared/package.json`, unless `specs/tech-stack.md` names it and
  gives the reason.

## Not part of the merge bar

Considered and left out on purpose. They are still worth doing.

- **Docs match the code.** The plan updates the docs (group 10), but the bar
  does not require it. A reviewer should still read the diff for them.
- **A real run per runtime with a test skill.** The spike (group 1) does this
  once, by hand, and records the result. It is not repeated as a merge check,
  because Claude Code runs cost money.
- **Running the new migration on your real database.** It runs on the next
  server start. Take a backup first if the data matters.

If a later change breaks something these would have caught, add the check to
the bar then.
