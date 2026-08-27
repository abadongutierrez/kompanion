# Agent notes

## How to reply

- be concise and to the point
- user short sentences
- use plain english, no fancy working
- always end your replies with footer: ----- Reply by <model> -----

## Single backend

The backend is `server-kotlin/` — a Kotlin/Spring Boot app on port `3200`
(see `ui/vite.config.ts`'s `/api` proxy target). It owns the schema via
Flyway migrations in `server-kotlin/src/main/resources/db/migration/`,
which run on boot.

This repo used to carry a second, equivalent Node/Express/TypeScript
backend in `server/`, kept in lockstep with the Kotlin one. That server
was removed from `main`; it is preserved intact on the
`typescript-server` branch. Docs written before the removal (`DESIGN.md`,
`docs/`, `.plans/`) still cite `server/src/...` paths — read those as
historical references to the TypeScript implementation, and use the
Kotlin equivalent under `server-kotlin/src/main/kotlin/com/kompanion/server/`.

The remaining pnpm workspaces are `ui/`, `packages/shared/` (Zod schemas
and types the UI consumes), and `e2e-tests/`.

## Agents, not Roles

The entity formerly called `Role` is now `Agent` (migration `V15`). It had
already shed `discipline`, `reportsToRoleId`, and team/project ownership,
leaving `title` + `slug` + `harnessPath` — an agent definition, not a
position on an org chart. DESIGN.md's original Role/Actor split was never
built and isn't coming back.

Watch the level collision the shared word hides: `.claude/agents/*.md`
inside a harness are Claude Code **subagents**, spawned within one of our
Agents' runs. Call those subagents in prose; `Agent` (capitalized) always
means the app entity. Harness directories on disk keep their old names
(`engineer/`, `qa/`, `product_manager/`, `project_manager/`) — an Agent
points at one by absolute path, so the folder name carries no meaning.

## Agent runtimes

An Agent names the CLI it runs on (`agents.runtime`) and optionally a model
(`agents.model`, free text — the id formats differ per CLI). Two runtimes
exist: `claude_code` and `opencode`. Adding a third means adding an
`AgentRunner` `@Component` under `service/runner/`; `RunTaskService` keeps
everything runtime-agnostic and resolves runners from injected beans.

A harness folder can serve both — `CLAUDE.md` + `.claude/` for Claude Code,
`AGENTS.md` + `.opencode/` for opencode. `workspace/harnesses/engineer/`
carries all four and is the reference example.

`task_runs` stores `runtime` and `model` as well, stamped when the run
starts. That is not redundant with the Agent: replaying a stored transcript
means picking the reducer that matches the event shape, and an Agent can be
switched to another CLI afterwards.

### opencode runs are not enforced

**Known and accepted asymmetry.** Claude Code runs are confined by the
`PreToolUse` hook in `workspace/hooks/`: raw Bash is denied, everything goes
through `exec_in_folder.py`, which checks folder membership and appends to
`commands.log`. opencode has no equivalent the server can install — its
extension points are JS/TS plugins and a per-agent permission config — so an
opencode run is scoped by `--dir` and nothing else, with no command log.

Prefer Claude Code for agents working in real repositories. If opencode
enforcement is needed later, the shape would be a plugin under
`.opencode/plugin/` materialized by `OpencodeRunner.prepareWorkspace` the way
the hook files are copied today.
