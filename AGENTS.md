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
