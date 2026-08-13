# herdr.dev — research and integration options

## What Herdr is

Herdr (https://herdr.dev/) is a background **runtime for persistent terminal
sessions running AI coding-agent CLIs**. It doesn't replace an agent CLI
(Claude Code, Codex, Cursor, opencode, Grok, etc. — 19 detected out of the
box) — it owns the terminal/session infrastructure around it:

- **Persistence across restarts.** Agents keep running when the laptop lid
  closes or the network drops; on machine restart Herdr restores the pane
  layout and resumes sessions (detach/restart-restore, scrollback replay,
  native agent resume, live handoff).
- **State awareness.** Each agent pane is tracked as `working` / `blocked` /
  `idle` / `done`, queryable and subscribable as an event stream, so a human
  or another process can tell which agents need attention without polling
  raw terminal output.
- **Multi-agent coordination.** Agents can split panes, prompt peer agents,
  and block on each other's real completion instead of polling.
- **Local socket API** (`~/.config/herdr/herdr.sock`, newline-delimited JSON,
  `HERDR_SOCKET_PATH` overridable) plus a CLI (`herdr ...`) that wraps it.
  No auth beyond filesystem permissions on the socket — it's designed for
  single-machine, single-operator use, not as a networked multi-tenant
  service.
- Apache 2.0, cross-platform (macOS/Linux, Windows beta), plugin
  marketplace for local executable plugins with manifest actions/event
  hooks.

### Socket API surface (relevant methods)

| Domain | Methods |
| --- | --- |
| Workspace | `create`, `list`, `focus`, `rename`, `close` |
| Tab | `create`, `list`, `focus`, `rename`, `close` |
| Pane | `split`, `swap`, `move`, `zoom`, `resize`, `read`, `send_text`, `send_keys` |
| Agent | `list`, `get`, `prompt`, `wait`, `start`, `focus` |
| Session | `snapshot` |
| Server | `ping`, `stop`, `reload_config` |

Example: start an agent in a pane, then block until it's done:

```json
{"method":"agent.start","params":{"pane_id":"w1:p1"}}
{"method":"agent.wait","params":{"pane_id":"w1:p1","until":"done"}}
```

Events (e.g. `pane.agent_status_changed`) can be subscribed to instead of
polling `agent.wait`.

## How this project runs agents today

For comparison, `server/src/runner/runTask.ts` (TS backend; `RunTaskService`
+ `ClaudeHarnessService` in Kotlin — see [[dual-server-parity]]) currently:

1. Spawns `claude -p <prompt> --output-format stream-json
   --include-partial-messages --dangerously-skip-permissions` directly via
   `child_process.spawn` (argv array, never a shell string).
2. Runs it **synchronously**, one task at a time, with a hard 180s timeout
   and no persistence — if the process, the machine, or the server restarts
   mid-run, the run is just marked failed. There is no "resume."
3. Streams stdout JSONL lines straight into `task_run_events` (DB) and out
   over SSE (`runEvents.ts`) as they arrive — the app *is* the terminal, in
   effect; there's no real terminal/pane in between.
4. The heartbeat scheduler (`heartbeat.ts`) enforces "one Claude Code
   process at a time" with an in-memory `ticking` flag — explicitly not
   real concurrency, and explicitly not surviving a server restart either.

So today's biggest gaps relative to what Herdr provides are exactly
persistence-across-restart and true concurrent/multi-agent execution — both
called out as known limitations in `DESIGN.md` (Heartbeats section: "no
atomic row-level task checkout... acceptable for a single-operator setup").

## Where Herdr could fit

Herdr is not an orchestrator with a task queue, DB, or web UI — it's
infrastructure for *keeping agent processes alive and observable*. It maps
onto the **execution layer** of this project (the part that currently is
`spawn(bin, args, {cwd, env})` inside `runClaudeStreaming`), not onto the
task/role/workspace domain model, which stays exactly as-is.

### Option A — Replace direct `spawn` with Herdr-managed panes (biggest lift, biggest payoff)

Instead of `child_process.spawn`, `runTaskWithClaude` would:

1. Call `workspace.create` (or reuse one) with `cwd` = the task's
   worktree/scratch dir, then `pane` create + `agent.start` in that pane
   with the prompt (`agent.prompt` / `pane.send_text`).
2. Subscribe to `pane.agent_status_changed` (or poll `agent.wait
   until:"done"`) instead of listening to `child.stdout`/`child.on('close')`.
3. Use `pane.read` (`source: "recent"`/`"detection"`) to pull output for
   persisting into `task_run_events`, in place of parsing `stream-json`
   stdout directly.

This buys: a run survives an `npm run dev` restart or an OS reboot (Herdr
resumes the pane; the TS/Kotlin server just needs to reconnect to the
existing pane/agent on boot instead of assuming every run row it finds
`running` is dead), and true multi-agent concurrency without the app having
to build its own process-pool/locking (Herdr already serializes/parallelizes
panes and exposes agent state per-pane).

Cost: it's a real architectural dependency — requires the `herdrd` (or
equivalent) background process running alongside the app, a new client
layer for the socket protocol (no official Node/Kotlin SDK found on the
site; would mean hand-rolling a small NDJSON-over-unix-socket client in
both `server/` and `server-kotlin/`, per [[dual-server-parity]]), and it
only really pays off in a **single-machine, single-operator deployment** —
same shape this project already targets (per `DESIGN.md`'s accepted
heartbeat limitation), so this is a plausible fit, not a mismatch, but it's
not designed for a networked/multi-tenant server deployment at all (no
auth on the socket beyond filesystem perms).

### Option B — Use Herdr only as an observability/attach layer (small lift)

Keep `spawn()` exactly as it is, but launch the Claude Code process *inside*
a Herdr-managed pane (e.g. `herdr pane send_text` running the same `claude
-p ...` command Herdr would otherwise auto-detect) purely so a human
operator gets persistent-session survival and a TUI to peek into a running
task's terminal, without touching the DB-streaming/event pipeline the app
already relies on for its own UI. Lowest risk, but also delivers the least
— it doesn't fix the "restart loses run state" or "no true concurrency"
gaps, since the app's own supervision loop is untouched.

### Not a fit

Herdr's plugin/marketplace and multi-agent peer-prompting features
(agents coordinating each other inside Herdr) overlap with what this
project's own Role harness + shared-workspace mechanism already does
deliberately at the *domain* level (Engineer → QA → PM handoff via a
shared task workspace, see `DESIGN.md`'s Role harness section) — adopting
Herdr's peer-coordination on top would be two competing coordination
models for the same problem, not additive.

## Recommendation

Given the project is pre-Repositories/worktrees-in-anger and still
single-operator, Option A is the more interesting fit **once** the
Repositories & Worktrees work (`DESIGN.md`, "planned — not built yet")
lands, since that's exactly when a run acting on a real worktree over a
long-lived task would most benefit from surviving a restart. Before that,
Option B (or doing nothing) is lower-risk and reversible. Recommend
prototyping Option A against **one** backend first (not both — contrary to
the usual [[dual-server-parity]] rule, this is infrastructure spike/research,
not a feature) to validate the socket API is usable from Node before
committing to building it twice.

## Open questions / follow-ups

- No official client library was found for the socket API from the pages
  fetched — worth checking the Herdr GitHub repo directly for a Node/TS or
  JVM client before hand-rolling one.
- Confirm whether `agent.start`/`agent.prompt` can pass the same flags this
  project relies on (`--dangerously-skip-permissions`,
  `--append-system-prompt`, env vars `TASK_WORKSPACE_DIR`/`TASK_ID`) or
  whether Herdr's agent detection assumes interactive/default-flag
  invocation only.
- Confirm exit-code/result-JSON equivalent is retrievable through
  `pane.read`/`agent.get` with enough fidelity to keep extracting
  `total_cost_usd` for budget enforcement (`budget.ts`) — Herdr's docs
  describe state (`working`/`blocked`/`idle`/`done`) but not a structured
  "final result" object equivalent to Claude Code's `stream-json` result
  line.
