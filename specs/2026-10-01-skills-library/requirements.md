# Requirements — Skills library

Roadmap item: "Skills library" (`specs/roadmap.md`). It builds on the library
and workspace roots (`specs/2026-09-30-library-and-workspace-roots/`).

## Problem

A skill is a folder (`SKILL.md` plus files) that an agent loads when the task
matches. Today a skill can only live inside one harness
(`library/harnesses/<name>/.claude/skills/`). To share a skill you copy the
folder, and the copies drift.

There is also no record of what an agent knew when it ran. The prompt is not
stored, and the harness is copied fresh each run, so after the next run the
earlier setup is gone.

This work adds:

1. A shared library of skills that an operator assigns ("teaches") to Agents.
2. A stored, hashed copy of the exact setup each run used, called an **agent
   instance**.

It follows mission principles 3 (runtime-agnostic, say plainly where a
runtime cannot do it), 5 (honest state) and 6 (spec first).

## Scope

In:

1. Skills as folders under `library/skills/<slug>/`, with a `skills` row that
   holds the path.
2. Registering skills: by path, and by a scan of `library/skills/`.
3. Assigning skills to an Agent (`agent_skills`), through the API and a
   "Skills" section in the create and edit Agent forms.
4. Building an agent instance at run start: the harness plus the assigned
   skills, laid out the way the Agent's runtime loads them.
5. Storing agent instances by hash in `WORKSPACE_ROOT/agent-instances/<hash>/`.
6. Recording on every run: the instance hash, the git commit and dirty flag,
   and each skill's slug, hash and outcome.
7. A Skills page (list, register, scan, unregister, read-only view), and an
   agent instance panel on the run view.
8. The first skill, `kompanion-context`, which reads the run's
   `manifest.json` through a read-only script.
9. A spike that checks how each runtime really loads skills.
10. Docs, and moving the roadmap item to Done.

Out (later):

- Editing skill content in the UI.
- Import from a git URL, skill bundles, per-Project default skills.
- Replaying a run from its agent instance.
- Deleting old agent instances.
- Automatic handoff between Agents.
- Hook scripts inside the agent instance (see Decisions 11).
- Windows paths. Linux and WSL only, like the rest of the app.

## Decisions

1. **One spec, one PR.** Skills and agent instances ship together. The work
   is staged inside the plan, and each stage leaves the app working.
2. **Skills live on disk, rows point at them.** Same pattern as an Agent's
   `harnessPath`. `skills.skill_path` is absolute, or relative to
   `LIBRARY_ROOT` (`skills/handoff`). The existing `resolveLibraryPath` and
   `toStoredLibraryPath` are reused. No new path rule.
3. **A skill is valid when** its folder exists and holds a `SKILL.md` with a
   `name` and a `description` in the frontmatter (the Agent Skills standard).
   The slug is the folder name. It must be lowercase letters, digits and
   dashes, and unique app-wide. The frontmatter `name` must equal the folder
   name, because the runtimes load a skill by that name and a mismatch would
   make the harness-clash check and the loading disagree.
4. **Rows cache `name` and `description`** from the frontmatter, so lists are
   fast. A scan refreshes them. A row whose folder is missing or invalid is
   shown as broken, and is never deleted by a scan.
5. **Register and scan.** `POST /api/skills` registers one path.
   `POST /api/skills/scan` registers every valid folder under
   `library/skills/` that has no row yet, and refreshes existing rows.
6. **Unregister is refused while assigned.** `DELETE /api/skills/{id}` returns
   409 and names the Agents that still have it. The operator un-teaches first.
   The folder on disk is never touched.
7. **Assigning replaces the set.** `PUT /api/agents/{id}/skills` takes the
   full list of skill ids. `GET /api/agents/{id}/skills` returns it, with
   each skill's status and whether the harness already has a skill with that
   slug (it would win, see 8). The Agent response itself is not changed, so
   nothing existing breaks.
8. **Name clash: the harness wins.** If the harness already has a skill with
   the same slug in the runtime's skills folder, the library skill is skipped
   for that run and recorded as `skipped_harness_has_it`. Existing harnesses
   behave exactly as today.
9. **A missing skill folder at run time** does not stop the run. The skill is
   skipped and recorded as `missing`. The run page shows it. A silent skip
   would be worse, and a failed run costs money.
10. **Agent instance contents, per runtime.** The instance holds only the
    files that runtime reads, so a change to another runtime's files does not
    change the hash:

    | Runtime | Instance holds | Library skills go in |
    | --- | --- | --- |
    | `claude_code` | `CLAUDE.md`, `.claude/` | `.claude/skills/<slug>/` |
    | `pi` | `AGENTS.md` or `CLAUDE.md`, `pi-agent/`, `.pi/skills`, `.claude/skills` | `.pi/skills/<slug>/`, passed with `--skill` |
    | `opencode` | `AGENTS.md` or `CLAUDE.md`, `.opencode/` | `.opencode/skills/<slug>/` (see 14) |

11. **Not in the instance:** run state and platform code.
    - The enforcement hook scripts and the pi extension are installed after
      the instance is built, from `LIBRARY_ROOT`. They are server code. Their
      version is covered by the recorded `git_sha`, not by the hash.
    - pi's own runtime files (`auth.json`, `models-store.json`, `trust.json`,
      `sessions/`, `npm/`) are excluded. They may hold credentials, and they
      change on their own. `PiRunner` still copies them from the harness into
      the run's config folder, as it does today.
12. **Hashing.** One SHA-256 over the sorted relative file paths and file
    bytes. Timestamps, permissions and ordering do not matter, so identical
    content always gives the same hash. A skill's own hash uses the same
    function over its folder.
13. **The store.** `WORKSPACE_ROOT/agent-instances/<hash>/`, global, written
    once and never changed. It holds the instance in the runtime's layout and
    an `instance.json` (runtime, created at) that is not part of the hash. The
    live copy in the run's cwd is built from the stored instance, so what ran
    is what was stored. A run builds in a temporary folder first and moves it
    into place only when the hash is new.
14. **opencode: supported.** The spike (done 2026-10-01, opencode v2.0.18,
    `ollama/llama3.2`) put a test skill in each candidate folder and asked the
    model to load it with opencode's `skill` tool. It loaded from all four of
    `.claude/skills/`, `.agents/skills/`, `.opencode/skills/` and
    `.opencode/skill/`, and the phrase in the skill came back. The control run
    with no skill failed to load it. v1 puts opencode's library skills in
    `.opencode/skills/<slug>/`, because `OpencodeRunner` already owns and
    rebuilds `.opencode/` each run, so nothing lands in the repo's own
    folders. No "unsupported runtime" rule is needed. Skill loading was also
    confirmed for pi (`--skill <folder>`, a read of the skill file and the
    phrase back, none without the skill). Claude Code's `.claude/skills/` is
    what the existing harnesses already use.
15. **Git facts.** `git_sha` is `git rev-parse HEAD` in `LIBRARY_ROOT`'s
    repo. `git_dirty` is true when `git status --porcelain` is not empty for
    the harness and skill folders the instance used. Both are null when
    `LIBRARY_ROOT` is not in a git repo or `git` is missing. Git is called with
    an argv array, never a shell string.
16. **Runs record their skills** in a new table, `task_run_skills` (run id,
    slug, hash, outcome), and three new `task_runs` columns (`instance_hash`,
    `git_sha`, `git_dirty`). A new Flyway migration, V22. No applied migration
    is edited.
17. **Retention.** v1 deletes nothing. An instance is only created for a run,
    and each run points at it, so the store grows only with distinct setups.
    A cleanup tool is a later item.
18. **First skill.** `library/skills/kompanion-context/` holds a `SKILL.md`
    and `scripts/manifest.py`. The script reads
    `$TASK_WORKSPACE_DIR/manifest.json` and prints one value: `worktree`,
    `task-workspace`, `branch`, `repos` or `roots`. It never writes. It is a
    normal library skill, assigned like any other.
19. **Architecture.** A new hexagonal slice, following
    `server-kotlin/ARCHITECTURE.md`. Models in `domain/`, ports and use cases
    in `application/`, SQL and files in `adapter/outbound/`, the controller in
    `adapter/inbound/web/`. `RunTaskService` is old layered code. It calls a
    port and does not grow new logic.
20. **No behavior change for agents.** Confinement, `manifest.json`, the
    prompt lines and budgets stay as they are. The only change an agent sees
    is the extra skills.

## Context

- `ClaudeCodeRunner.prepareWorkspace` deletes `<cwd>/.claude` and copies the
  harness's `.claude/` in. `CLAUDE.md` goes in through
  `--append-system-prompt`, not as a file.
- `OpencodeRunner.prepareWorkspace` deletes `<cwd>/.opencode`, copies the
  harness's `.opencode/` and writes `.opencode/agents/kompanion.md`. It has no
  skills code.
- `PiRunner` copies `pi-agent/` into the task workspace. It passes
  `--skill <harness>/.pi/skills` and `--skill <harness>/.claude/skills` when
  they exist, so pi reads skills in place and nothing lands in the repo.
- `RunContext.harnessDir` is what runners read today. This work adds an
  instance folder and moves the runners to read from it.
- `RunTaskService.runTaskWithClaude` inserts the run row, builds the manifest,
  builds `RunContext`, then calls `runner.prepareWorkspace`. The instance is
  built just before that call, and its hash is stored on the run row.
- The UI has `features/agents/` (api, hooks, components) and the pages
  `AgentFormPage.tsx` and `AgentsLibraryPage.tsx`. A new `features/skills/`
  follows the same shape. Shared types are Zod schemas in
  `packages/shared/src/domain.ts`.
- E2E tests are Playwright, in `e2e-tests/tests/`, against the running stack.
  `agents.spec.ts` and `fixtures.ts` show how Agents are created today.
- Agents cannot be deleted, so test Agents stay forever. Tests that assign
  skills must clean up after themselves.
- The stack is fixed by `specs/tech-stack.md`: Kotlin and Spring Boot, Flyway,
  React and TanStack Query, Zod in `packages/shared`. No new dependency is
  expected. A YAML frontmatter parser is the one possible exception, and a
  small hand parser for `name` and `description` is preferred first.

## Risks

- **The installed opencode is v2.0.18, but `OpencodeRunner` was written for
  an older one.** `opencode run` in v2 has no `--dir` flag, and the runner
  passes it, so an opencode run through Kompanion likely fails today. This is
  not caused by this work and is not fixed by it. It needs its own item
  (add it to the roadmap). Skills for opencode are built and tested at the
  file level, and the real loading was checked with the CLI directly.
- **A skill script and shell enforcement.** From the code: a Claude Code
  agent runs every command as
  `python3 .claude/hooks/exec_in_folder.py --taskId … --folder … --command "…"`.
  That command runs with the process environment (`TASK_WORKSPACE_DIR`,
  `TASK_ID`) and a cwd inside the allowed roots, and it never checks where
  the script itself lives, so a skill copy works. On pi the extension rewrites
  bash calls into the same wrapper, and opencode is not enforced. A skill
  that ships a script must tell the agent to run it through the wrapper on
  Claude Code. Group 7 runs it through the real wrapper to confirm.
- **`TASK_WORKSPACE_DIR` in subagents and child processes.** Subprocesses of
  Claude Code inherit it (the hook scripts already rely on that). pi has no
  subagents of its own. Not verified for a pi child process.
- **Credentials in the store.** Decision 11 keeps pi's credential files out.
  A harness that puts secrets in another file would copy them into the store.
  The docs must say harnesses are not for secrets.
- **A harness folder shared by two runtimes.** The instance picks one runtime's
  files, so the same harness gives two different instances. That is correct.
- **Hash cost.** Instances are small text folders. Hashing a few hundred files
  per run is negligible next to starting an agent.
