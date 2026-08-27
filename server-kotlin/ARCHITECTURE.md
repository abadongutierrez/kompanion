# Architecture — `server-kotlin`

This is the architecture `server-kotlin` follows: **Hexagonal Architecture**
(ports and adapters), applied to a Kotlin / Spring Boot 4 service that talks
HTTP to the UI, Postgres over Spring Data JDBC, and agent CLIs as child
processes.

This document is the rule, not a description of the current tree. Parts of
the code predate it and are still layered `controller → service →
repository`. See [Where we are today](#where-we-are-today) for what already
conforms and how new work moves toward it.

---

## Why hexagonal here

This server's whole job is to sit between things that change at different
speeds:

- The **UI** talks REST + SSE, and will not be the only caller forever.
- **Postgres** owns the schema through Flyway, but no domain rule cares that
  a task row has a `running_since` column.
- **Agent CLIs** are the volatile part. `claude_code` and `opencode` are
  already two implementations of the same idea, and a third is a matter of
  time (see the root `AGENTS.md`).

The rule that keeps orchestration from rotting each time one of those moves
is: **the decisions live in the middle, the mechanisms live at the edges,
and the middle never names the edges.**

---

## The dependency rule

There is exactly one:

> Source dependencies point **inward**. `domain` knows nothing. `application`
> knows `domain`. `adapter` knows `application` and `domain`. Nothing inside
> ever imports from `adapter`.

At runtime the flow crosses outward all the time — a use case calls
Postgres. It does so through an interface it owns (an **outbound port**),
which an adapter implements and Spring injects. The compile-time arrow still
points inward; the runtime call is inverted.

```
        driving side                                    driven side
   (adapters that call us)                        (adapters we call)

   HTTP / REST  ──┐                                ┌── Spring Data JDBC
   SSE          ──┤                                ├── agent CLI processes
   (future: CLI, ─┤  inbound      ┌──────────┐  outbound ├── filesystem / worktrees
    webhooks)   ──┘   ports  ───► │ applica- │ ◄─ ports  └── clock, event bus
                                  │  tion    │
                                  │ ┌──────┐ │
                                  │ │domain│ │
                                  │ └──────┘ │
                                  └──────────┘
```

---

## Package layout

One Gradle module. Boundaries are enforced by package structure and review,
not by build wiring — the module is small enough that splitting it would
cost more than it buys. If drift becomes a problem, the answer is an
ArchUnit/Konsist test (see [Enforcement](#enforcement)), not a multi-module
split.

```
com.kompanion.server
├── domain/                  the model and the rules. Pure Kotlin.
│   ├── model/               Task, Agent, Team, Project, Repository, TaskRun, …
│   ├── rule/                TaskStatusTransitions, budget arithmetic, …
│   └── error/               DomainException and its subtypes
│
├── application/             use cases. Orchestration, no mechanism.
│   ├── port/inbound/        what the outside may ask us to do
│   ├── port/outbound/       what we need the outside to do for us
│   └── usecase/             the implementations of the inbound ports
│
├── adapter/
│   ├── inbound/
│   │   └── web/             @RestController, request/response DTOs, error mapping
│   └── outbound/
│       ├── persistence/     Spring Data JDBC repositories, row types, mappers
│       ├── runner/          AgentRunner implementations (claude_code, opencode)
│       ├── workspace/       harness resolution, git worktrees, manifest files
│       └── event/           SSE relay / in-process run event bus
│
└── config/                  Spring configuration and bean wiring only
```

### `domain/`

Plain Kotlin data classes and functions. The test is mechanical: **would
this file still compile with Spring, Jackson, and JDBC off the classpath?**
If not, it is in the wrong package.

Not allowed here: `@Table`, `@Id`, `@ReadOnlyProperty`, `@JsonProperty`,
`java.sql.*`, `ResponseEntity`, `HttpStatus`, `File`, `ProcessBuilder`.

`TaskStatusTransitions.kt` is what a domain file looks like — a transition
table and `isValidTaskTransition`, no framework in sight. It is already
correct and moves as-is.

Domain types describe the concept, not the row. `Task` has a status and a
type; whether the DB stores those as text and whether the UI receives them
camelCased are both somebody else's problem.

### `application/`

A use case is one thing an actor can ask the system to do: run a task,
assign an agent to a team, transition a task's status, register a
repository. Each is an interface in `port/inbound/` and one implementation
in `usecase/`.

Use cases orchestrate: they load through outbound ports, apply domain rules,
persist through outbound ports, and publish. They contain no SQL, no HTTP,
no `ProcessBuilder`, no path strings.

**Pragmatic exception, stated once so it isn't re-litigated:** use case
implementations may carry `@Service` and `@Transactional`, and take their
ports as constructor parameters. Those two annotations are wiring metadata
that changes nothing about the code's meaning, and the alternative — a
hand-written configuration class per use case — is ceremony with no payoff.
Everything else Spring stays outside. In particular: no `Spring Data`
repository types, no `JdbcTemplate`, no web types, ever.

`@Transactional` belongs on the use case and nowhere else. The use case is
the transaction boundary because it is the unit of work; an adapter opening
its own transaction is a bug.

### `application/port/outbound/`

**The ports belong to the application, not to the adapter that implements
them.** Name them for the need, in the domain's vocabulary — `TaskStore`,
`RunLauncher`, `WorkspaceProvisioner`, `RunEventPublisher`, `Clock` — never
for the technology (`JdbcTaskRepository`, `ClaudeCliGateway`).

A port's signature speaks domain types. `TaskStore.save(task: Task): Task`,
not `save(row: TaskRow): TaskRow`. Translation is the adapter's job, and
paying for it there is exactly what buys the isolation.

`AgentRunner` is the port to copy. It already exists at
`service/runner/AgentRunner.kt` and gets the shape right: it names the four
things that genuinely differ per CLI (`validateHarness`, `prepareWorkspace`,
`buildCommand`, `interpret`) and nothing else, with `RunContext` carrying
the run's facts inward. `RunTaskService` stays runtime-agnostic and resolves
implementations from injected beans. When it moves to
`application/port/outbound/`, the interface changes only its package.

### `adapter/inbound/web/`

Controllers are thin by rule. A controller may:

1. deserialize and syntactically validate the request,
2. map it to a use case command,
3. call exactly one use case,
4. map the result or the domain error to a status code and response DTO.

A controller may **not** hold a business rule, call a repository, touch
`JdbcTemplate`, or call another controller. Today several do —
`AgentController` validates harness directories and `TaskController` checks
status transitions and runs its own SQL. Each of those is a use case wearing
a controller's clothes, and moves when that endpoint is next touched.

Wire DTOs live here and are separate types from domain models, even when
they look identical. They are a published contract shared with `ui/` and
`packages/shared/`; a domain refactor must not be able to silently reshape
a JSON payload.

Domain errors map to HTTP in one place — a `@RestControllerAdvice` in this
package — not in `catch` blocks scattered across controllers.

### `adapter/outbound/persistence/`

Spring Data JDBC lives here and only here. Persistence row types are
`@Table`-annotated data classes named `*Row` (`TaskRow`, `AgentRow`), kept
distinct from `domain/model` types, with mappers between them. That
separation is what lets the schema carry columns the domain does not model,
and lets the domain hold values the schema flattens.

The hybrid `JdbcTemplate` approach for queries that do not fit a single
aggregate — the `array_agg` join behind `repositoryIds`, the `team_agents`
link table — stays legitimate. It is confined to this package, behind an
outbound port, and its results are mapped to domain types before crossing
the boundary.

Flyway keeps owning the schema. Migrations in
`src/main/resources/db/migration/` are the source of truth for what the
database looks like; row types follow migrations, never the reverse.

### `adapter/outbound/runner/`, `workspace/`, `event/`

Everything that shells out, touches the filesystem, or fans events out to
SSE subscribers. `ProcessBuilder`, `File`, worktree layout, `manifest.json`,
harness path resolution: all here, all reachable from the inside only
through a port.

Two properties this buys that matter for this system specifically:

- A use case can be tested against a fake `RunLauncher` — no CLI installed,
  no `$5` of tokens spent, no minutes of wall clock.
- Adding a third runtime is a new class in one package plus a new enum
  constant. Nothing in `application/` or `domain/` recompiles.

---

## Rules of thumb

- **Name ports for the need, adapters for the technology.** `TaskStore` /
  `JdbcTaskStore`. If a port's name contains a vendor, it is modelled from
  the wrong side.
- **One use case per operation.** A `TaskService` that grows to fourteen
  public methods is a layer, not a use case; split it.
- **Cross a boundary, map the types.** DTO ↔ domain ↔ row. The mapping is
  the point, not overhead to optimize away.
- **The domain does not ask what time it is or generate its own IDs.** Both
  arrive from outside — a `Clock` port, or DB-generated as today — so that
  behaviour stays deterministic under test.
- **No cycles between adapters.** Two adapters that need each other are
  telling you a use case is missing between them.
- **A rule the UI enforces is not enforced.** `packages/shared` mirroring a
  domain rule in Zod is a convenience for the user; the server validates it
  regardless.

---

## Testing

The layout exists to make the middle cheap to test. The split:

| Scope | What it covers | How |
|---|---|---|
| Domain | rules, transitions, budget arithmetic | plain JUnit, no Spring context |
| Use case | orchestration, error paths, ordering | real use case + in-memory fake ports |
| Web adapter | routing, serialization, status mapping | `@WebMvcTest` with a stubbed use case |
| Persistence adapter | SQL, mapping, migrations | `@DataJdbcTest` against a real Postgres |
| End to end | the whole thing | `e2e-tests/` |

Fakes over mocks for outbound ports. An in-memory `TaskStore` backed by a
map is more readable than a stack of `every { … } returns …`, and it fails
loudly when a port's contract changes.

If testing a use case needs a Spring context, a database, or a CLI on
`PATH`, the boundary is in the wrong place. That is the diagnostic this
architecture is for.

---

## Where we are today

Already conforming:

- `AgentRunner` + `ClaudeCodeRunner` / `OpencodeRunner` — a real port with
  two adapters, and the template for the rest.
- `TaskStatusTransitions.kt` — a pure domain rule with no framework.
- `RunTaskService` — genuinely runtime-agnostic orchestration.

Known gaps, in the order they are worth closing:

1. Business rules in controllers (`AgentController` harness validation,
   `TaskController` status transitions and inline SQL) — extract to use
   cases.
2. `entity/` types are simultaneously domain models and Spring Data rows —
   split into `domain/model` + `adapter/outbound/persistence/*Row`.
3. Repository interfaces are injected directly into controllers and services
   — introduce outbound ports and let persistence implement them.
4. `service/` mixes use cases (`RunTaskService`, `BudgetService`) with
   adapters (`ClaudeHarnessService`, `RepoWorkspaceService`,
   `RunEventsBus`) — separate them into `application/usecase` and
   `adapter/outbound/`.

**Migration is strangler-style, not a rewrite.** New endpoints and new
features are built in the target layout from the start. Existing code moves
when it is being changed anyway, one vertical slice at a time — a slice
being one endpoint moved end to end, not a layer moved across all
endpoints. A half-migrated tree is expected and fine; a slice left half
migrated is not.

## Enforcement

Reviewed by hand today. The dependency rule is a one-line check, so if it
starts slipping the fix is a Konsist or ArchUnit test in `src/test/` that
fails the build when `domain` or `application` imports
`org.springframework.web`, `org.springframework.data`, `java.sql`, or
`com.kompanion.server.adapter`. Add it when it earns its keep, not before.
