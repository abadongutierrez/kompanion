# Agent runtimes — how Claude Code, opencode and pi are driven

An Agent names the CLI it runs on (`agents.runtime`) and optionally a model
(`agents.model`). Three runtimes exist: `claude_code`, `opencode` and `pi`.
This document covers what all three share, what each one needs specifically,
and what is deliberately different between them.

The seam is `AgentRunner`
(`server-kotlin/src/main/kotlin/com/kompanion/server/service/runner/AgentRunner.kt`).
`RunTaskService` owns everything runtime-agnostic — the budget gate,
worktrees, the manifest, status transitions, persisting events, the SSE relay,
the timeout — and a runner owns only the five things that genuinely differ per
CLI: what a valid harness looks like, what gets materialized into the
workspace, the command line, extra environment, and how to read the resulting
event stream.

---

## Common to all three

### The call

`RunTaskService.runAgentStreaming` spawns the CLI and reads its stdout:

- `ProcessBuilder(argv)` with `.directory(cwdDir)`. **argv, never a shell
  string** — task-supplied text becomes prompt content and must never be
  shell-interpreted.
- stdin is `/dev/null`. Without it a CLI inherits the JVM's, waits ~3s on a
  pipe nobody writes to, and the run dies before any work happens.
- Environment: the JVM's own, plus `TASK_WORKSPACE_DIR` and `TASK_ID`, plus
  whatever `runner.environment(ctx)` adds. Credentials are never read or
  passed by us — each CLI finds its own through the inherited environment.
- Every stdout line that parses as JSON is inserted into `task_run_events`
  **verbatim** and published to the SSE bus as it arrives. stderr is buffered
  and used only for failure summaries.
- A daemon thread kills the process after `CLAUDE_RUN_TIMEOUT_MS`
  (default 30 minutes).

### The prompt

Built by `RunTaskService.buildPrompt` as plain text lines:

```
Task ID: <uuid>
Task: <title>
Type: story|bug|chore|spike
Description: <...>              (when set)
Acceptance criteria: <...>      (when set)
Workspace: <repo mode + branch + other linked repo paths, or "scratch">
Task workspace: <absolute path> — plans, notes and handoff files go here
<team snapshot>                 (project-manager slug only)
<mention context>              (when the run came from a comment)
```

The harness file is passed separately as the system prompt. Nothing else is
sent by us; whatever repository content reaches the model is read by the CLI's
own tools during the run.

### Where a run happens

| Directory | What it is |
| --- | --- |
| `cwdDir` | The git worktree for the task's branch, or the task workspace when no repo is linked. Code lives here and gets committed. |
| Task workspace | `<project workspace>/tasks/<taskId>/`. Ours and the agent's: `manifest.json`, `commands.log`, `activity.log`, `pi-sessions/`, plus plans and notes. Never committed. |
| Harness | The Agent's template folder. Read-only input; runners copy from it, never into it. |

`manifest.json` is written fresh before every run and is the single source of
truth for branch, repo paths and allowed roots. It is read-only to the agent.

### What is recorded

`task_runs` stores runtime, model, status, summary, `raw_output`, `cost_usd`
and the four token columns — all stamped when the run starts or finishes, not
read back through the Agent, so replaying an old run still reflects what
actually produced it. `task_run_events` stores the raw stdout lines.

**The prompt itself is not stored.** It survives only if the CLI echoes it in
its event stream — pi does, Claude Code does not.

### Reading the events back

`packages/shared/src/runTranscript.ts` holds one reducer per runtime, selected
by `task_runs.runtime`. The server never interprets event payloads; it
persists and relays them, and the UI reconstructs blocks client-side.

### Budgets

A pre-flight gate refuses a run once the team is over its monthly budget,
recording an `over_budget` run row. Only Claude Code can additionally enforce
a ceiling mid-run (`--max-budget-usd`); opencode and pi have no such flag.

---

## `claude_code`

```
claude -p <prompt> --output-format stream-json --include-partial-messages
       --verbose --dangerously-skip-permissions
       [--model <model>] [--append-system-prompt <harness CLAUDE.md>]
       [--max-budget-usd <team remainder>]
```

- Binary from `CLAUDE_BIN`, default `claude`.
- System prompt: the harness `CLAUDE.md`, passed as a flag so it can never
  clobber a real repository's own `CLAUDE.md`.
- `prepareWorkspace` replaces `<cwd>/.claude/` wholesale with the harness's
  copy (so skills and subagents don't accumulate across agents) and installs
  the enforcement hooks.
- Subagents (`.claude/agents/*.md`) and skills (`.claude/skills/*/SKILL.md`)
  work natively.
- Events: Anthropic's streaming Messages format. Cost comes from the final
  `result` line's `total_cost_usd`; tokens from its `usage`.

## `opencode`

```
opencode run --format json --dir <cwd> --agent kompanion --auto
             [--model <model>] <prompt>
```

- Binary from `OPENCODE_BIN`, default `opencode`.
- opencode has no `--append-system-prompt`, so the harness text has to reach
  it as a file: `prepareWorkspace` writes `<cwd>/.opencode/agents/kompanion.md`
  (ours, inside a directory we rewrite each run) rather than `AGENTS.md` at the
  repo root, which would overwrite the project's own.
- `--auto` is required: without it an unattended run blocks waiting for a
  permission answer nobody is there to give.
- Events: newline-delimited `part` events. Cost accumulates across
  `step_finish` events; zero is a real answer for a local model and is
  reported as such.
- Model ids carry a provider prefix — `ollama/qwen2.5-coder:7b`.

## `pi`

```
pi -p --mode json --no-approve
   --session-dir <task ws>/pi-sessions
   -e <workspace>/pi/enforce-workspace.ts
   [--model <model>] [--append-system-prompt <harness AGENTS.md|CLAUDE.md>]
   [--skill <harness>/.pi/skills] [--skill <harness>/.claude/skills]
   -- <prompt>
```

- Binary from `PI_BIN`, default `pi`. Verified against pi 0.84.3.
- Environment: `PI_OFFLINE=1`, `KOMPANION_EXEC_IN_FOLDER`, and
  `PI_CODING_AGENT_DIR` pointing at the run's copy of the harness `pi-agent/`.
- **A pi run writes nothing into the repository**: system prompt by flag,
  extension by absolute path, config directory in the task workspace.
- `--` ends option parsing so a prompt starting with a dash stays prompt text.
- `--no-approve` keeps a repository's own `.pi/extensions` — arbitrary code —
  from loading. Our extension is unaffected: an explicit `-e` path loads
  regardless of project trust.
- Events: `session`, `agent_start`, `message_update` (delta-only), tool
  execution events, `message_end`, `agent_end`. Usage is per assistant
  message and is summed across the run.

### pi-specific setup

**Provider catalogue.** pi does not discover models from a server. Custom
providers exist only in `models.json` inside the config directory, which for a
run is `<harness>/pi-agent/` copied into the task workspace. `--model` selects;
it cannot define a provider:

| `--model` | outcome |
| --- | --- |
| `lmstudio/qwen3.8-27b` (declared) | runs |
| `lmstudio/qwen3.8-9b-distill` (undeclared, known provider) | runs, with `Warning: … Using custom model id` and default context/thinking settings |
| `qwen3.8-9b-distill` (no provider prefix) | `Error: Model … not found` |
| `nosuchprovider/foo` | `Error: Model … not found` |

The LM Studio provider shipped in the harnesses points at
`http://172.29.112.1:1234/v1` — a WSL-to-Windows host address that will differ
per machine.

**Skills.** pi scans skills from its config directory and from `cwd` — never
from the harness, which is neither. `PiRunner` passes `--skill` for the
harness's `.pi/skills` and `.claude/skills` when they exist. pi implements the
Agent Skills standard, so a `SKILL.md` written for Claude Code loads unchanged
and both runtimes share one definition.

**Subagents.** pi has none natively. `.claude/agents/*.md` are ignored. If the
`pi-subagents` package is ever adopted, note that it launches children as
separate `pi` processes and forwards none of the parent's flags — which is why
the enforcement extension is installed into `pi-agent/extensions/` as well as
passed with `-e`. Only the config-directory copy reaches a child.

**Local models are slow.** A trivial two-tool task took ~70s on a 27B model
served by LM Studio, and a real task several minutes. `CLAUDE_RUN_TIMEOUT_MS`
is the ceiling to raise. `httpIdleTimeoutMs: 0` in the harness
`pi-agent/settings.json` disables pi's 300s idle timeout for the same reason.

---

## Enforcement, compared

Claude Code and pi runs are confined to the roots in `manifest.json` — the
repo worktrees plus the task workspace. `manifest.json` itself is read-only:
it is where the enforcement code reads its own permissions from.

| | claude_code | opencode | pi |
| --- | --- | --- | --- |
| Mechanism | `PreToolUse` hook (`workspace/hooks/`) | — | blocking `tool_call` extension (`workspace/pi/`) |
| File tools | confined | unconfined | confined |
| Shell | raw Bash denied; only `exec_in_folder.py` | unconfined | rewritten to `exec_in_folder.py` |
| Command log | `commands.log` | none | `commands.log` |

opencode is the one unenforced runtime: its extension points are JS/TS plugins
and a per-agent permission config, with no equivalent the server can install.
An opencode run is scoped by `--dir` and nothing else. Prefer Claude Code or
pi for agents working in real repositories.

Residual gap, stated rather than hidden: a shell command routed through
`exec_in_folder.py` could overwrite `manifest.json`, since no hook can inspect
arbitrary shell. The blast radius is one run — the server rewrites the manifest
before every run.

---

## Harness layout

One folder can serve all three runtimes. `workspace/harnesses/engineer/` is
the reference example.

| Path | Used by |
| --- | --- |
| `CLAUDE.md` | Claude Code system prompt; fallback for opencode and pi |
| `AGENTS.md` | opencode and pi system prompt (in `qa/` it is a symlink to `CLAUDE.md`) |
| `.claude/` | Claude Code: skills, subagents, hooks, settings |
| `.claude/skills/` | also passed to pi with `--skill` |
| `.opencode/` | copied into `<cwd>/.opencode/` for opencode runs |
| `pi-agent/` | pi config directory: `models.json`, `settings.json`; copied per run, and the enforcement extension is added to `pi-agent/extensions/` |

`pi-agent/.gitignore` excludes `auth.json`, `models-store.json`, `trust.json`,
`sessions/` and `npm/` — pi writes those into whatever config directory it is
aimed at, and they are runtime state, not template.

The harness-template endpoint (`GET`/`PATCH /api/agents/{id}/harness-template`)
reads and writes `CLAUDE.md` regardless of runtime.

---

## Adding a fourth runtime

1. Add the constant to `AgentRuntime` (Kotlin and `packages/shared/src/domain.ts`)
   and a migration widening the `agents_runtime_check` constraint.
2. Add an `AgentRunner` `@Component` under `service/runner/`. Nothing in
   `RunTaskService` or `GlobalAgentsController` changes — both resolve runners
   from injected beans.
3. Add a reducer branch in `packages/shared/src/runTranscript.ts`, keyed on the
   runtime stored on the run.
4. Add the runtime's label and model placeholder to the UI's per-runtime
   lookups in `AgentFormPage.tsx`.
5. Decide the enforcement story up front and write it down — that is the part
   that is easy to skip and expensive to retrofit.
