# SDLC Kompanion

Orchestrates AI coding agents as a software development team: Projects hold
Teams, Teams hold Agents and Tasks, and running a Task hands it to an agent
CLI in a real git worktree.

- [DESIGN.md](DESIGN.md) — the domain model and what is actually built.
- [AGENTS.md](AGENTS.md) — notes for agents (and humans) working in this repo.
- [docs/agent-runtimes.md](docs/agent-runtimes.md) — how Claude Code, opencode
  and pi are driven.
- [server-kotlin/ARCHITECTURE.md](server-kotlin/ARCHITECTURE.md) — the
  architecture the Kotlin server follows.

## Layout

| Path | What it is |
| --- | --- |
| `server-kotlin/` | The backend: Kotlin / Spring Boot on port 3200, Postgres via Flyway. |
| `ui/` | React + Vite frontend. |
| `packages/shared/` | Zod schemas and types the UI consumes. |
| `e2e-tests/` | Playwright suite. |
| `workspace/` | Agent harnesses, enforcement hooks, and per-project task workspaces. |

## Running it

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres on 5433
cd server-kotlin && ./gradlew bootRun            # API on 3200, runs migrations
pnpm -C ui dev                                   # UI on 5173, proxies /api
```

Tests: `./gradlew test` (server), `pnpm -C packages/shared test`,
`pnpm -C e2e-tests test:e2e` (needs the stack running).

## Commit format

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>

<optional body>

<optional footers>
```

- **type** — one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
  `build`, `ci`, `perf`, `style`, `revert`.
- **scope** — the part of the repo touched, when it helps: `server`, `ui`,
  `shared`, `e2e`, `workspace`, `docs`, or something narrower like
  `runner/pi`.
- **description** — imperative mood, lowercase, no trailing period. Say what
  the commit does, not what you did: `fix: deny writes to manifest.json`, not
  `fixed a bug`.
- **body** — why, not what. The diff already says what.
- **breaking changes** — a `!` after the type/scope (`feat(server)!: …`) and a
  `BREAKING CHANGE:` footer describing the migration.

Examples:

```
feat(runner): add pi as a third agent runtime
fix(hooks): keep manifest.json read-only to the agent
docs: explain how each agent CLI is invoked
refactor(server): move task status transition to a use case
```

### Commits made by an agent

Any commit created by an AI agent — whether by an Agent running inside this
system or by a coding CLI a human is driving — **must** name the model in a
`Co-authored-by` footer, so `git log` stays an honest record of what wrote
what:

```
feat(runner): add pi as a third agent runtime

pi has a blocking tool_call hook, so its runs get the same workspace
confinement as Claude Code rather than opencode's none.

Co-authored-by: Claude Opus 5 <noreply@anthropic.com>
```

Rules:

- One `Co-authored-by` line per model that contributed, last in the message,
  after any other footers.
- Name the model, not the harness: `Claude Opus 5`, `Qwen3.8 27B`, not
  "Claude Code" or "pi".
- The human who reviewed and landed the change stays the commit author. The
  footer records assistance, it does not transfer responsibility.
- A commit with no agent involvement gets no footer. Do not add one
  reflexively.
