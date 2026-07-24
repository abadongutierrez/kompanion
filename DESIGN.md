# Design: an SDLC-flavored Paperclip

**Status:** working system. Domain model, Claude-only harness mechanism, cross-role shared workspaces, autonomous heartbeat execution, and budget enforcement are all implemented and verified end-to-end. See **What's built** below for the honest current state — Objectives, Ceremonies, and Review gates are still just table entries, not code.

## One-liner

Paperclip orchestrates AI agents as a **company** chasing a business goal. This project orchestrates AI agents as a **software development team** running a delivery process — sprints, code review, on-call — instead of a generic org chasing revenue.

**Paperclip's unit is the company. This project keeps Company as the top-level isolation boundary too — but a Company runs one or more Projects, and teams live inside a Project.**

## Why not just use Paperclip as-is

Paperclip's domain model (Company → Agent → Goal → Issue) is deliberately generic so it fits any business. That genericness costs SDLC-specific structure we'd otherwise get for free:

- A "goal" in Paperclip is a business objective ($1M MRR). A dev team's unit of work is an epic/feature tied to a roadmap, not a revenue number.
- Paperclip's org chart is reporting lines only. A dev team also has discipline (engineer vs. QA vs. designer) and process role (who reviews, who approves a merge, who's on call) that reporting lines don't capture.
- Paperclip's governance is generic approval gates. Software delivery has specific, well-known gates: code review, CI passing, QA sign-off, deploy approval.
- Paperclip's ticket system is generic issues. Dev work needs branch/PR linkage, sprint/iteration membership, and story-shaped fields (points, acceptance criteria).

None of this requires reinventing orchestration mechanics (heartbeats, budgets, audit trails, workspaces) — those are domain-agnostic and worth keeping conceptually. It requires a domain model layered on top that speaks the language of software delivery.

## Hierarchy

```
Company                  (the isolation boundary — matches Paperclip's Company literally, not a rename)
└── Project(s)           (a product / codebase / roadmap within the Company)
    └── Team(s)          (a squad within the Project — Paperclip has no equivalent; Company was flat)
        └── Role(s)      (a position on the team, e.g. Engineer, QA)
            └── Actor    (the AI agent instance assigned to a Role)
        └── Task(s)      (assigned to a Role, traced back to a Project-level Objective)
```

A Company can run multiple Projects (e.g. "Acme Corp" running a "Website" Project and a "Mobile App" Project, each with their own Teams and roadmap). A Project can in turn host multiple Teams. **Built so far only ever populates one Company/one Project/one Team** — the containment exists in the schema, nothing exercises a second Company, Project, or Team yet.

## Domain model

| Paperclip concept | This project | Status |
| --- | --- | --- |
| Company | **Company** | Kept as Company, not renamed — this is the isolation boundary, same role it plays in Paperclip. **Not built yet**: no `companies` table exists; `projects.company_id` doesn't exist either. Next thing to build. |
| *(none — Company was flat)* | **Project** | Schema exists (`projects` table) but currently sits at the top with no parent — adding `company_id` is the pending migration. **Not built yet:** a Project should own a list of **Repositories** (the repos that make up "the product") and a local **workspace root** where those repos are cloned — see Repositories & Worktrees below. Today a Project has no repo linkage at all. |
| *(none — Company was flat)* | **Team** | Built. One Team seeded so far; per-Team monthly budget is real (see Budget below). |
| Agent | **Actor** | Built, **Claude Code only** — no adapter abstraction exists in code (see Stack). |
| Agent's job description | **Role** | Built: `title`, `discipline` (`product_manager` / `engineer` / `qa` / others unused so far), `reportsToRoleId`. Three disciplines have a working **harness** (below); others have none. |
| Goal | **Objective** | **Not built.** Tasks have no `objectiveId` or any roadmap linkage yet — still just a table-of-concepts entry. Scoped to Project (a roadmap outcome for one product), not Company — a Company's Projects can have unrelated roadmaps. |
| Issue / Ticket | **Task** | Built: type, status, story points, acceptance criteria, branch/PR link field. `branchOrPrLink` exists but has been unused so far — it's about to become real once Tasks execute against actual repo worktrees instead of scratch directories (see Repositories & Worktrees). State machine below. |
| Governance / Approval gates | **Review gates** | **Not built.** `in_review → done` today is the same generic status-transition button as any other move — no distinct approval action, no required reviewer role. |
| Routines & Schedules | **Ceremonies** | **Not built.** No standup/retro/on-call concept exists. |
| Heartbeats | **Heartbeats** | Built — see Heartbeats below. |
| Work Products | Work Products | Implicit only: a Task's shared workspace *is* its work product directory, but there's no separate Work Product entity, listing, or attachment concept. |
| Budget & Cost Control | **Budget & Cost Control** | Built, scoped to **Team** (not Company/Project — see Budget below for why, and the open question on whether that should change now that Company exists). |
| Runtime skill injection | **Role harness** | Built — see Role harness below. |

## Task state machine

`backlog → in_progress → in_review → done`, with `blocked` reachable from (and returning to) any non-terminal state. Transitions happen two ways:

- **Manual**, via the UI's per-card buttons — any transition `isValidTaskTransition()` allows.
- **Automatic**, driven by a Claude run's outcome (`server/src/runner/runTask.ts`): starting a run moves `backlog → in_progress`; a successful run moves to `in_review`; a failed run moves to `blocked`. Both call the same `transitionTaskStatus()` helper, so a run can never violate the state machine — it just silently no-ops if the current state doesn't allow the target transition (e.g. re-running an already-`done` task doesn't move it).

## Role harness

A Role harness is a template directory under `server/harnesses/<discipline>/`:

```
server/harnesses/engineer/
  CLAUDE.md                     # role framing
  .claude/
    skills/implement-task/SKILL.md
    agents/planner.md
    settings.json                # Stop hook
```

Three exist: `engineer` (implement-task skill, planner subagent), `qa` (verify-task skill, test-planner subagent), `product_manager` (refine-task skill, breakdown subagent). Mapping is a fixed `HARNESS_DIR_BY_DISCIPLINE` constant in `server/src/runner/claudeHarness.ts` — not a DB column, per the "shared template" resolution below.

**Workspaces are shared across roles, not per-role.** Each Task gets exactly one workspace, `server/workspaces/<taskId>/` — not one per role. Before every run, `runTaskWithClaude()` wipes and re-copies the *currently assigned* role's `.claude/` + `CLAUDE.md` into that workspace (`prepareWorkspace()` in `server/src/runner/runTask.ts`), but leaves everything else — prior roles' output files, the shared `activity.log` — untouched. This is what actually makes "QA verifies the Engineer's work" true: reassign a Task from Engineer to QA and QA's session starts in the exact same directory Engineer just wrote to. Verified live: QA found and ran Engineer's actual code, then PM read both Engineer's solution and QA's verdict and tightened the acceptance criteria to close the exact gaps QA flagged.

**A real gotcha this uncovered:** Claude Code resolves `.claude/settings.json` hooks *only* from the exact `cwd`, not by walking up to an ancestor directory — confirmed by testing, not documentation. Skills and `CLAUDE.md` *do* get discovered from ancestors, hooks don't. This is why the workspace is a real, self-contained directory with its own copied-in `.claude/`, rather than a subdirectory nested under the harness template with cwd left at the harness root.

Execution is **synchronous**: `-p --output-format json --dangerously-skip-permissions`, spawned via argv array (never a shell string — task-supplied text becomes prompt content, never shell-interpreted), with a 180s timeout.

## Repositories & Worktrees (planned — not built yet)

Everything above is proven against a **disposable scratch directory** (`server/workspaces/<taskId>/`) with no relationship to a real codebase — the point so far was proving the harness mechanism, not shipping code. That changes now: a Task's workspace should be a real **git worktree** against a real repo, so an Engineer's "solution" is an actual commit on an actual branch, not a markdown file.

- **Project gains Repositories.** A Project owns a list of Repositories that together make up "the product" — each with at least a git remote URL, a name/slug, and a default branch.
- **Project gains a local workspace root.** Something like `server/project-workspaces/<projectId>/repos/<repoSlug>/` — each Repository cloned once and kept up to date (pulled), not re-cloned per Task. This is the Project-level analog of what `server/harnesses/` is for Roles: a stable thing that gets checked out from, not recreated each run.
- **A Task targets one Repository** (of the Project's list) for v1 — no multi-repo Tasks yet, keeps this tractable.
- **Running a Task creates (or reuses) a worktree**, not a bare directory: `git worktree add <path> -b task/<taskId>` off the target Repository's default branch, rooted under something like `server/project-workspaces/<projectId>/worktrees/<taskId>/`. The Role harness's `.claude/` + `CLAUDE.md` still get materialized into that worktree directory exactly as they do into today's scratch workspace — same mechanism, just a real git working directory as the destination instead of an empty folder.
- **Cross-role collaboration gets stronger, not different.** Engineer, QA, and PM already prove out working sequentially in the same shared directory for a Task (see Role harness above) — with a real worktree, that becomes Engineer committing real code, QA running it for real and potentially adding real test files, PM annotating real diffs. The mechanism doesn't change; what's real underneath it does.
- **`branchOrPrLink`** (currently unused on Task) gets populated with the worktree's branch name once this lands.

**Explicitly out of scope for this pass:** merging the branch back, opening a PR, or any cleanup/removal of a worktree once a Task reaches `done`. This is about giving Tasks a real place to do real work — the integration lifecycle (PR flow, review gates hooking into it) is separate, later work.

## Heartbeats

`server/src/runner/heartbeat.ts` — a background scheduler, **off by default** (`HEARTBEAT_ENABLED` / `HEARTBEAT_INTERVAL_MS` env vars). When enabled, it ticks on an interval: finds the oldest `backlog` Task whose assigned Role has a resolvable harness, and runs it through the same `runTaskWithClaude()` path a manual "Run with Claude" click uses — same workspace behavior, same auto-transitions, same audit trail. A `ticking` in-memory flag keeps runs strictly sequential (one Claude Code process at a time, never concurrent). `GET /api/heartbeat/status` + a header indicator in the UI surface enabled/interval/last-tick state.

**Known limitation, accepted:** no atomic row-level task checkout (e.g. `SELECT ... FOR UPDATE SKIP LOCKED`). A manual "Run" click and a heartbeat tick could theoretically both read the same task as `backlog` in the same instant. Not fixed — acceptable for a single-operator setup, would need addressing before any real concurrent-user scenario.

## Budget & Cost Control

Scoped to **Team**, not Project as originally sketched in the domain model — Team is where Roles and Tasks actually live day to day, and Project doesn't yet do anything beyond containment, so Team was the pragmatic choice for v1.

- `teams.monthly_budget_usd` (nullable) — set via `PATCH /api/teams/:teamId/budget`.
- Every `task_runs` row now carries `cost_usd`, extracted from Claude's own `--output-format json` result (`total_cost_usd` — **snake_case**; worth noting because postgres.js's `camelCase` transform on the way out of the DB made it *look* camelCased in every earlier inspection, which cost real debugging time before the actual raw field name was found).
- `getTeamSpend()` (`server/src/runner/budget.ts`) sums `cost_usd` for the current calendar month. `runTaskWithClaude()` checks this **before** touching the harness or spawning Claude — if spend ≥ budget, it inserts a `task_runs` row with `status: "over_budget"` (cost `0`, a clear summary) and refuses, rather than throwing a bare error. Manual runs and heartbeat runs both inherit this for free since they call the same function.
- A `numeric` Postgres columns gotcha, fixed once at the client level (`server/src/db/client.ts`): the `postgres` driver returns `numeric` as a string by default (precision safety) — registered a custom type parser so `cost_usd` / `monthly_budget_usd` come back as real JS numbers everywhere, not strings that silently break `.toFixed()` or numeric comparisons.

## Stack

Following Paperclip's stack rather than inventing a new one, trimmed for v1 scope:

- **Server:** Node/TypeScript, Express, Postgres (local via Docker Compose — `docker-compose.dev.yml`).
- **UI:** React + Vite, TypeScript, Tailwind.
- **Monorepo:** pnpm workspaces (`server`, `ui`, `packages/shared`).
- **Testing:** typecheck via `pnpm typecheck`; no automated test suite yet — verification so far has been live curl + Playwright-driven browser checks against a running server, not committed tests.
- **Agent adapter:** Claude Code only, invoked via the real `claude` CLI binary (`CLAUDE_BIN` env var — needed because `claude` is often a shell function, not a spawnable binary, on a dev machine).

## Open questions

- Do Roles have a fixed taxonomy or are they freeform per team? Still unresolved — `RoleDiscipline` is a fixed enum today.
- Are Role harnesses versioned/shared templates, or defined fresh per Project/Team? Resolved in practice: fixed, shared, filesystem-based templates keyed by discipline — not yet revisited for multi-Project scenarios.
- Should the manual-run/heartbeat race (above) get atomic checkout, or is "single operator, low volume" an acceptable permanent assumption?
- What should a formal review gate look like — a distinct approval action, a required-reviewer-role check, or something else — now that `in_review → done` is real but ungated?
- Now that Company exists as the isolation boundary, should budgets ever roll up to Company (a shared pool across its Projects/Teams), or stay purely per-Team? Team-level is what's built; nothing forces it to stay that way once Company lands.
- Does adding Company change anything about Project? Right now Project is a thin, almost-unused container (no repo linkage, no budget, no UI beyond bootstrap) — worth asking whether it earns its place once Company actually does the isolation-boundary job Project was originally sketched to do.
- How does a Repository actually get registered — a manual "add repo" action with a git URL (assuming SSH/auth is already set up on the host), or something more guided? Cloning a real repo is also the first operation in this whole system with a real, non-trivial failure mode (auth, network, huge repos) worth planning for.
- Does a Task really only ever target one Repository, or will multi-repo Tasks (a change spanning a frontend and backend repo) show up quickly enough that the one-repo assumption doesn't survive contact with reality?
- What cleans up a worktree — does it live forever once created, get removed on `done`, or only get pruned manually? Not deciding this yet, but it's the next question once worktrees are real.
