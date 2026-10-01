# Plan — Skills library

One PR, in stages. After each numbered group the app still builds and the
tests pass. Decisions are in `requirements.md`, referenced as "D<n>".

## Stage 1 — Find out how runtimes load skills

### 1. Spike: how each runtime loads skills (done, see D14 and Risks)

- Make a throwaway skill that, when asked, replies with a fixed phrase.
- For each runtime, put it where the plan says (D10) and check the CLI uses
  it:
  - Claude Code: `.claude/skills/<slug>/`.
  - pi: `--skill <dir>` pointing at a folder of skills.
  - opencode v2: try `.claude/skills/`, `.agents/skills/` and `.opencode/`
    folders, and note which one loads.
- Check that a skill script can run under shell enforcement (Claude Code and
  pi) and that `TASK_WORKSPACE_DIR` is set inside it, including in a
  subagent.
- Write the results into `requirements.md` (D14, Risks) and
  `docs/agent-runtimes.md`. If opencode cannot load skills, say so there and
  set the "unsupported" rule for group 5.
- Use the cheapest model for each run. pi on a local model costs nothing.

## Stage 2 — The library

### 2. Schema and domain

- Flyway `V22`: tables `skills` and `agent_skills`, table `task_run_skills`,
  and the columns `task_runs.instance_hash`, `git_sha`, `git_dirty`.
- Domain models: `Skill`, `AgentSkill`, `AgentInstance`, `LoadedSkill`, and
  the outcomes (`loaded`, `skipped_harness_has_it`, `missing`).
- Domain errors for the invalid and in-use cases, reusing `DomainException`.

### 3. Register, scan, list, unregister

- Inbound ports and use cases: `RegisterSkill`, `ScanSkills`, `ListSkills`,
  `UnregisterSkill`.
- Outbound ports: `SkillStore` (rows) and `SkillFiles` (read frontmatter,
  check the folder, list `library/skills/`, hash a folder).
- Adapters: `JdbcSkillStore`, `FileSkills`, and a `SkillController` with
  `GET /api/skills`, `POST /api/skills`, `POST /api/skills/scan`,
  `DELETE /api/skills/{id}`.
- Rules from D3 to D6: valid folder, unique slug, broken status, refuse
  unregister while assigned.
- Tests: use case tests with fakes (as `AgentUseCasesTest` does), a file
  adapter test on temp folders, and a controller-level test of the 409.

### 4. Assigning skills to Agents

- Ports and use cases: `AssignSkills` (replace the set) and `ListAgentSkills`.
- Endpoints: `PUT` and `GET /api/agents/{id}/skills`. The GET returns status
  and the "harness has it" flag (D7, D8).
- All three runtimes support skills (D14), so assignment has no runtime rule.
- Tests: replace semantics, unknown skill id, the harness-clash flag.

## Stage 3 — Agent instances

### 5. Build, hash and store

- `AgentInstances` outbound port, with `FileAgentInstances` adapter:
  - assemble the runtime's layout in a temporary folder (D10), harness first,
    then library skills, skipping clashes and missing folders (D8, D9);
  - exclude the pi runtime files (D11);
  - hash it (D12) and move it to `agent-instances/<hash>/` if new (D13);
  - return the instance folder, the hash, and each skill's slug, hash and
    outcome.
- `GitFacts` outbound port and adapter for `git_sha` and `git_dirty` (D15).
- One shared hash function for instances and skills.
- Tests: same input gives the same hash, a changed byte changes it, file
  order and timestamps do not matter, a second build reuses the folder, pi
  credential files are excluded, clash and missing outcomes, and each
  runtime's layout.

### 6. Runners read from the instance

- Add `instanceDir` to `RunContext`. `ClaudeCodeRunner`, `OpencodeRunner` and
  `PiRunner` copy and read from it instead of `harnessDir`.
- `PiRunner` passes `--skill <instance>/.pi/skills` and
  `--skill <instance>/.claude/skills`, and still copies the credential files
  from the harness into the config folder.
- `RunTaskService` builds the instance just before `prepareWorkspace` and
  records the hash, git facts and skills (D16). The call goes through the
  port.
- Tests: each runner's `prepareWorkspace` against a built instance (the
  skill lands where D10 says), and the run record is written.
- Run the existing runner tests unchanged first, to prove an Agent with no
  skills behaves exactly as before (D20).

### 7. First skill: kompanion-context

- `library/skills/kompanion-context/SKILL.md` and `scripts/manifest.py`.
  Commands: `worktree`, `task-workspace`, `branch`, `repos`, `roots`.
  Read-only, standard library only.
- A shell test for the script, in the style of `bin/tests/`: each command on
  a sample manifest, a missing manifest, an unknown command.
- Apply the spike's findings on running scripts under enforcement.

## Stage 4 — UI, E2E and docs

### 8. Shared types and the UI

- `packages/shared`: Zod schemas for `Skill`, an Agent's skill entry, and a
  run's agent instance and skills. Tests in the shared package.
- `ui/src/features/skills/` (api, keys, hooks, components), following
  `features/agents/`.
- Skills page: list with status, register by path, scan, unregister (shows
  the 409 message), and a read-only view of a skill's description and body.
- "Skills" section in `AgentFormPage` (create and edit): checkboxes for the
  library, a note when the harness already has that skill, and a message for
  an unsupported runtime. Saving writes through `PUT /api/agents/{id}/skills`.
  On create, it runs after the Agent exists.
- Run view: an agent instance panel with the short hash, git commit and dirty
  flag, and each skill with its outcome.

### 9. E2E tests

- New Playwright spec for skills: register, scan, list, unregister refused
  while assigned, assign in the Agent form, and the run view panel.
- The spec creates its own skill folder and removes it and its rows after,
  because Agents and rows are permanent otherwise.

### 10. Docs and roadmap

- `README.md` (layout, `library/skills/`), `AGENTS.md` (a Skills section and
  the agent instance), `DESIGN.md`, `docs/agent-runtimes.md` (per-runtime
  skill layout and the spike results), and `specs/tech-stack.md` if a
  dependency was added.
- Move "Skills library" to Done in `specs/roadmap.md`.
- Run `./gradlew test`, `pnpm -C packages/shared test` and the E2E suite.
  Commit by stage.
