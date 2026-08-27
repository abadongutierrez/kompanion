# Agent notes — `server-kotlin`

Repo-wide notes are in the root [AGENTS.md](../AGENTS.md). This file covers
the Kotlin server only.

## Read this first

**[ARCHITECTURE.md](ARCHITECTURE.md) defines the architecture of this
project — Hexagonal Architecture (ports and adapters).** Read it before
adding or moving code here. It specifies the package layout, the dependency
rule, what belongs in `domain` / `application` / `adapter`, and the
strangler-style migration path away from the layered code that predates it.

The short version: dependencies point inward, the domain has no framework in
it, and anything that shells out, talks SQL, or speaks HTTP is an adapter
behind a port.

## What this is

A Kotlin / Spring Boot 4 service on port `3200`, backing the `ui/` app. Java
21 toolchain, Gradle wrapper, Spring Data JDBC over Postgres, Flyway for the
schema.

## Working here

- Build and test: `./gradlew build` from `server-kotlin/`.
- The schema is owned by Flyway migrations in
  `src/main/resources/db/migration/`, which run on boot. Change the schema by
  adding a migration — never by editing an applied one.
- Postgres for local runs comes from `docker-compose.dev.yml` at the repo
  root.
- Docs older than the TypeScript server's removal (`DESIGN.md`, `docs/`,
  `.plans/`) cite `server/src/...` paths. Read those as history and use the
  Kotlin equivalent under `src/main/kotlin/com/kompanion/server/`.
