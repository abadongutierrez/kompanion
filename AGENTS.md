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
