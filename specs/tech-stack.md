# Tech stack

## Backend — `server-kotlin/`

- Kotlin 2.3, JDK 21, Spring Boot 4.1 (Gradle Kotlin DSL).
- Spring Data JDBC, Spring MVC, Jackson (Kotlin module).
- Postgres 16. Schema owned by Flyway migrations in
  `src/main/resources/db/migration/` (`V<n>__name.sql`, run on boot).
- Port `3200`.
- Architecture: hexagonal slices, see `server-kotlin/ARCHITECTURE.md`.
- Tests: `./gradlew test` (JUnit 5 via kotlin-test).

## Frontend — `ui/`

- React 19, TypeScript 5, Vite 6, Tailwind 4.
- TanStack Query for server state, React Router 7.
- Organised into feature slices.
- Port `5173`, proxies `/api` to `3200`.

## Shared — `packages/shared/`

- Zod schemas and types the UI consumes.
- Tests: Vitest (`pnpm -C packages/shared test`).

## End-to-end — `e2e-tests/`

- Playwright (`pnpm -C e2e-tests test:e2e`). Needs the full stack running.

## Agent runtimes

- Claude Code, opencode and pi, behind the `AgentRunner` seam.
- Each is spawned via an argv array, never a shell string.
- Details: `docs/agent-runtimes.md`.
- Harnesses live in `library/harnesses/<slug>/` (`LIBRARY_ROOT`). Generated
  data lives in `WORKSPACE_ROOT`, default `~/.kompanion/workspace`.

## Tooling

- pnpm workspaces (`ui`, `packages/shared`, `e2e-tests`).
- Docker Compose for dev Postgres (`docker-compose.dev.yml`, port `5433`,
  db/user/password `sdlc`).
- Conventional Commits. Agent commits carry a `Co-authored-by` model footer.

## Rules for changing the stack

- Schema changes go in a new Flyway migration. Never edit an applied one.
- New runtime or dependency needs a line in this file and a reason.
- The old Node/Express server lives on the `typescript-server` branch only.
  Do not revive it on `main`.
