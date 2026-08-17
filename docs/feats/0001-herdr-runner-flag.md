# 0001: Flagged Herdr runner (Option A prototype)

**Status:** proposed, not built — and **needs a rewrite before it can be
built**: it was written against the TypeScript backend (`server/`), which has
since been removed from `main` (it survives on the `typescript-server`
branch). The design below still holds in shape — a `CLAUDE_RUNNER` flag
selecting between the existing `spawn` path and a Herdr path behind the same
seam — but the seam, the code samples, and the "which backend" scope section
all need re-pointing at `server-kotlin`'s `RunTaskService.runClaudeStreaming`.

Background/rationale in
[`docs/herdr-integration.md`](../herdr-integration.md). See [`INDEX.md`](INDEX.md)
for the full feature list.

## Problem

Task runs today are a synchronous `child_process.spawn("claude", ...)` with
no persistence: a server restart or crash mid-run just leaves the run
`failed`, and only one run executes at a time (`heartbeat.ts`'s in-memory
`ticking` flag). Herdr offers restart-surviving, concurrent agent sessions,
but it's an unproven external dependency — a JSON-over-socket runtime with
no confirmed Node/JVM client, unknown fidelity for cost/result extraction,
and unconfirmed support for the exact `claude` CLI flags this project
depends on. We don't want to bet the only execution path on it.

## Goal

Add a **runner selection flag** so the existing `spawn`-based execution
stays the default and the Herdr-backed path can be developed, run in real
task executions, and rolled back instantly — without touching the task
domain model, DB schema, or SSE/event pipeline.

## Non-goals

- Not building Option B (attach-only observability pane).
- Not implementing the Herdr path in both `server/` and `server-kotlin/` in
  this pass — see Scope below, this is a deliberate exception to
  [[dual-server-parity]] because it's a research spike, not a feature.
- Not solving true multi-run concurrency (still one run at a time via the
  heartbeat's `ticking` flag) — that's a follow-on once the Herdr path is
  trusted, not part of this spec.
- Not removing or deprecating the `spawn` path; it remains the permanent
  default until/unless Herdr proves out.

## Design

### The seam

`runClaudeStreaming(prompt, cwd, runId, systemPromptAppend,
taskWorkspaceDir, taskId): Promise<ClaudeResult>` in
`server/src/runner/runTask.ts` is already fully self-contained: it takes
plain arguments, does its own DB writes for `task_run_events` and SSE
publish (`publishRunEvent`) as it streams, and resolves a `ClaudeResult`
(`ok`, `summary`, `rawOutput`, `costUsd`, `durationMs`). Nothing about the
caller (`runTaskWithClaude`) needs to change beyond which implementation of
that signature it calls.

### The flag

- Env var: `CLAUDE_RUNNER`, values `spawn` (default) | `herdr`.
- Read once at call time in `runTaskWithClaude` (no need to cache/module-load
  it — this isn't hot-path-sensitive, one read per run is fine):

```ts
const runner = process.env.CLAUDE_RUNNER === "herdr"
  ? runClaudeViaHerdr
  : runClaudeStreaming;
const result = await runner(prompt, workspaceDir, runId, systemPromptAppend, taskWorkspaceDir, task.id);
```

- Invalid/unset values fall back to `spawn` — never fail a run over a
  misconfigured flag.
- The flag is a per-process/deployment setting (like `HEARTBEAT_ENABLED`),
  not per-Task or per-Role — one running server is either Herdr-backed or
  not.

### `runClaudeViaHerdr` (new function, same file)

Mirrors `runClaudeStreaming`'s contract and side effects, swapping the
transport:

1. Ensure a Herdr workspace/pane exists for this run — `workspace.create`
   with `cwd: workspaceDir` (or reuse if one already maps to this
   `taskId`; see Open questions on identity/reuse), then start the agent:
   `agent.start` with the equivalent of today's argv (`-p <prompt>
   --output-format stream-json --include-partial-messages
   --dangerously-skip-permissions [--append-system-prompt ...]`) and env
   (`TASK_WORKSPACE_DIR`, `TASK_ID`).
2. Subscribe to `pane.agent_status_changed` for that pane instead of
   `child.stdout`/`child.on('close')`.
3. As output arrives (`pane.read` with `source: "detection"` or via the
   subscribed stream, whichever proves reliable — see Open questions),
   parse the same `stream-json` JSONL lines the direct-spawn path parses
   today, and persist/publish them through the *same* `handleLine`-style
   logic — `task_run_events` inserts and `publishRunEvent` must behave
   identically regardless of runner, so the UI/SSE consumer never knows
   which runner produced them.
4. On `agent.wait until: "done"` (or the terminal status event), extract
   the final `result`-type line the same way `extractCostUsd`/summary
   extraction works today, and resolve the same `ClaudeResult` shape.
5. Timeout: preserve the existing `RUN_TIMEOUT_MS` (180s) behavior —
   Herdr's `agent.wait` needs an equivalent bound (or a manual timer
   racing it) so a hung agent can't hold a run open forever.

### Restart handling (explicitly deferred)

Making runs actually survive a server restart requires more than the
runner swap — the server would need to reconnect to an existing Herdr pane
for any `task_runs` row it finds `status: 'running'` on boot, instead of
assuming it's dead. **Out of scope for this spec** — this spec only covers
running new tasks through Herdr while the server stays up; restart-resume
is a separate follow-on spec once the basic runner path is proven.

## Scope: which backend(s)

TypeScript (`server/`) only for this prototype. The flag itself
(`CLAUDE_RUNNER`, defaulting to `spawn`) should exist as a no-op read in
`server-kotlin/` too (so config parity holds and nothing silently diverges
in *shape*), but `ClaudeHarnessService`/`RunTaskService` only need to keep
behaving exactly as they do today — `herdr` is simply not a recognized
value there yet. Porting the real Herdr path to Kotlin is follow-on work
once the TS prototype is validated, per the exception to
[[dual-server-parity]] noted in Non-goals.

## Rollout

1. Land `runClaudeViaHerdr` behind `CLAUDE_RUNNER=herdr`, default untouched.
2. Run it against real backlog tasks locally (not in any shared/staging
   environment) with `CLAUDE_RUNNER=herdr` set manually, comparing
   `task_run_events`/cost/summary output against a `spawn` run of an
   equivalent task.
3. If output fidelity and cost extraction hold up, consider promoting
   `herdr` to default in a later, separate change — not part of this spec.

## Open questions (must resolve before implementation, not after)

- Does Herdr expose a Node client, or does this require hand-rolling an
  NDJSON-over-Unix-socket client in `server/`? (No client library was
  found in the pages fetched — check the Herdr GitHub repo directly.)
- Can `agent.start`/`agent.prompt` pass `--dangerously-skip-permissions`
  and `--append-system-prompt` through to the underlying `claude` CLI, or
  does Herdr's agent detection assume default/interactive flags?
- Does `pane.read`/`agent.get` surface the full `stream-json` JSONL stream
  (needed for the existing per-line `task_run_events` persistence and live
  SSE replay), or only coarser state transitions? If only coarser, the
  event-by-event replay UX may degrade under the Herdr path.
- Is there a stable identifier to reuse the same Herdr pane/workspace
  across re-runs of the same Task (mirroring how `workspaceDir` is
  deterministic per `taskId` today), or does every run need a fresh
  `workspace.create`?
