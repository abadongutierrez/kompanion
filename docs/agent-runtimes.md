# Agent runtimes — how Claude Code, opencode (v1 and v2) and pi are driven

An Agent names the CLI it runs on (`agents.runtime`) and optionally a model
(`agents.model`). Four runtimes exist: `claude_code`, `opencode` (opencode v1),
`opencode2` (opencode v2) and `pi`. This document covers what they all share, what each one needs specifically,
and what is deliberately different between them.

The seam is `AgentRunner`
(`server-kotlin/src/main/kotlin/com/kompanion/server/service/runner/AgentRunner.kt`).
`RunTaskService` owns everything runtime-agnostic — the budget gate,
worktrees, the manifest, status transitions, persisting events, the SSE relay,
the timeout — and a runner owns only the things that genuinely differ per
CLI: what a valid harness looks like, what gets materialized into the
workspace, the command line, extra environment, an optional post-run step
(`afterRun`, used by opencode2), and how to read the resulting
event stream.

---

## Configured runtimes (Settings page)

A **runtime** is one installed CLI plus how to launch it, kept in the
`runtimes` table and managed on the Settings page. An Agent may point at one
(`agents.runtime_id`); the runtime's kind then decides `agents.runtime`.

- `binary_path` overrides the command. Without it a run uses `CLAUDE_BIN` /
  `OPENCODE_BIN` / `OPENCODE2_BIN` / `PI_BIN`, then the bare command on PATH. An Agent with no
  runtime behaves exactly as before.
- `config_dir` (Claude Code only) is passed as `CLAUDE_CONFIG_DIR`, so two
  Claude runtimes can run as two accounts. A leading `~/` is expanded at run
  time. Only the path is stored; credentials stay in that folder and are never
  read by us.
- **Test** runs `<bin> --version` with the same binary and config dir. It
  proves the CLI starts and the folder exists, not that the login works.
- A runtime cannot be deleted while an Agent uses it. Changing an Agent's kind
  by hand drops its runtime, since that binary belongs to the other CLI.

---

## Common to all runtimes

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
| Harness | The Agent's template folder under `LIBRARY_ROOT`. Read-only input; nothing is ever written into it. |
| Agent instance | `WORKSPACE_ROOT/agent-instances/<hash>/`. The harness plus the Agent's skills, laid out for its runtime, built at run start and stored once by hash. Runners copy their working directory from it. |

`manifest.json` is written fresh before every run and is the single source of
truth for branch, repo paths and allowed roots. It is read-only to the agent.

### Agent instances and skills

Before the CLI starts, `PrepareAgentInstance` builds the **agent instance** for
the run: the harness files this runtime reads, plus the skills the Agent has
been taught, in the layout this runtime loads them from. It is assembled in a
staging folder, hashed (one SHA-256 over sorted relative paths and file bytes —
timestamps and listing order do not matter) and moved into
`agent-instances/<hash>/` only if that hash is new. Runs with the same content
share one folder. The runners then build the working directory and read the
system prompt from the instance, so what ran is what was stored.

| Runtime | Instance holds | Library skills go in |
| --- | --- | --- |
| `claude_code` | `CLAUDE.md`, `.claude/` | `.claude/skills/<slug>/` |
| `pi` | `AGENTS.md`, `CLAUDE.md`, `pi-agent/`, `.pi/skills`, `.claude/skills` | `.pi/skills/<slug>/`, passed with `--skill` |
| `opencode`, `opencode2` | `AGENTS.md`, `CLAUDE.md`, `.opencode/` | `.opencode/skills/<slug>/` |

The instance holds only what its own runtime reads, so a change to another
runtime's files in the same harness does not change its hash.

- **The harness wins a name clash.** If the harness already carries a skill with
  the same slug in a folder that runtime reads, the library skill is skipped for
  that run and recorded as `skipped_harness_has_it`.
- **A missing skill folder** does not stop the run. The skill is skipped and
  recorded as `missing`.
- **Not in the instance:** the enforcement hook scripts and the pi extension
  (server code, installed after the instance is built — the library commit
  recorded on the run covers their version), and pi's own runtime files
  (`auth.json`, `models-store.json`, `trust.json`, `sessions/`, `npm/`). Those
  may hold credentials and change on their own, so they are never stored;
  `PiRunner` still copies them from the harness into the run's config folder.
  Harnesses are not a place for secrets: anything else in a layout folder is
  copied into the store.
- **Verified loading** (opencode v2.0.18, pi 0.84.4): each runtime was given a
  test skill and asked to load it. pi loads from `--skill <folder of skills>`.
  opencode v2 loads from `.claude/skills/`, `.agents/skills/`,
  `.opencode/skills/` and `.opencode/skill/`; Kompanion uses `.opencode/skills/`
  because `OpencodeRunner` already owns and rebuilds `.opencode/`.
- **Shell enforcement and skill scripts.** On Claude Code every command runs as
  `python3 .claude/hooks/exec_in_folder.py --taskId … --folder … --command "…"`,
  with the process environment and a cwd inside the allowed roots; the script's
  own location is not checked, so a skill's script works. pi wraps bash calls
  into the same script for you.

### What is recorded

`task_runs` stores runtime, model, status, summary, `raw_output`, `cost_usd`
and the four token columns — all stamped when the run starts or finishes, not
read back through the Agent, so replaying an old run still reflects what
actually produced it. `task_run_events` stores the raw stdout lines.

It also stores what the run was built from, written before the CLI starts so a
run that fails halfway still has it: `instance_hash` (names the stored agent
instance), `git_sha` and `git_dirty` (the library commit, and whether the
harness or skill folders it used had uncommitted changes — null outside a git
repo), and one `task_run_skills` row per assigned skill with its slug, hash and
outcome (`loaded`, `skipped_harness_has_it`, `missing`). The instance hash is
the exact record; the commit alone does not reproduce a run when `git_dirty` is
true.

**The prompt itself is not stored.** It survives only if the CLI echoes it in
its event stream — pi does, Claude Code does not.

### Reading the events back

`packages/shared/src/runTranscript.ts` holds one reducer per runtime, selected
by `task_runs.runtime`. The server never interprets event payloads; it
persists and relays them, and the UI reconstructs blocks client-side.

### Budgets

A pre-flight gate refuses a run once the team is over its monthly budget,
recording an `over_budget` run row. Only Claude Code can additionally enforce
a ceiling mid-run (`--max-budget-usd`); opencode (v1 and v2) and pi have no
such flag.

### Resuming a run

`POST /api/teams/{teamId}/tasks/{taskId}/runs/{runId}/resume` with
`{ "message": "<follow-up>" }` continues a finished run's CLI session as a new
run (`task_runs.resumed_from_run_id` points back). It goes through the normal
run path: budget gate, status changes, events, SSE, timeout. `GET` on the same
URL answers `{ resumable, reason }`; the Runs tab asks it for the newest run
and shows the Resume action only when `resumable`.

The rules are `domain/rule/ResumeEligibility.kt`: only the newest run that
actually ran (budget refusals don't count), only a finished one, only on a
runtime that supports resume, only while the task's Agent, its runtime and its
agent instance hash are the run's, only with a recorded session id, and only
when the CLI keeps its sessions where it did then (`task_runs.session_store`).
After a handoff or a harness or skill change, start a fresh run instead.

A runner opts in through `AgentRunner`: `supportsResume`, `sessionIdFrom`
(stored on `task_runs.session_id` as soon as the CLI reports it),
`sessionStore`, `resumeProblem` (checked before the CLI starts, so a missing
session fails the run plainly instead of opening a blank one) and
`RunContext.resume`. Only Claude Code does today; pi and opencode are refused.

---

## `claude_code`

```
claude -p <prompt> --output-format stream-json --include-partial-messages
       --verbose --dangerously-skip-permissions
       [--model <model>] [--append-system-prompt <harness CLAUDE.md>]
       [--max-budget-usd <team remainder>]

# resume: the follow-up is the prompt
claude -p <follow-up> --resume <session_id> ...the same flags
```

- Binary from `CLAUDE_BIN`, default `claude`.
- System prompt: the harness `CLAUDE.md`, passed as a flag so it can never
  clobber a real repository's own `CLAUDE.md`.
- `prepareWorkspace` replaces `<cwd>/.claude/` wholesale with the agent
  instance's copy (so skills and subagents don't accumulate across agents) and
  installs the enforcement hooks. The system prompt is read from the instance
  too.
- Subagents (`.claude/agents/*.md`) and skills (`.claude/skills/*/SKILL.md`)
  work natively. Library skills are added to `.claude/skills/` in the instance.
- Events: Anthropic's streaming Messages format. Cost comes from the final
  `result` line's `total_cost_usd`; tokens from its `usage`.
- Resume: the session id comes from the first event, `system/init`, and stays
  the same across resumes. Sessions live in `<CLAUDE_CONFIG_DIR or
  ~/.claude>/projects/<escaped cwd>/<id>.jsonl`; the server runs the CLI with
  its own user and environment, so a resume finds what the run wrote. On
  `--resume`, `total_cost_usd` is the **session's running total**, not this
  process's spend (measured: $0.00204, then $0.00349 after a follow-up), so a
  resumed run stores the reported total minus the previous run's. A missing
  session makes the CLI print `No conversation found with session ID` and exit
  1; the server checks for the file first.

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
- Skills: `prepareWorkspace` copies the instance's `.opencode/` (library skills
  in `.opencode/skills/<slug>/`) and opencode's `skill` tool loads them.

This runtime is for opencode v1 (verified on 1.18.23) and is kept as it is.
opencode v2 removed `run --dir`, so this command line fails on v2. Use the
`opencode2` runtime for v2.

## `opencode2`

```
opencode2 run --standalone --format json --auto --agent kompanion
              [-m <provider/model#variant>] <prompt>
```

Verified against opencode v2.0.26 (2026-10-26). `Opencode2Runner` is a runner
of its own, so `OpencodeRunner` and v1 Agents are untouched.

- Binary from `OPENCODE2_BIN`, default `opencode2` (`~/.opencode/bin/opencode2`
  is a two-line wrapper around the v2 `opencode`).
- **No `--dir`.** v2 removed it. The working folder is the process cwd, and
  `RunTaskService` already starts the process in the worktree or scratch folder.
- **`--standalone`.** By default v2 talks to a shared background service
  (`opencode service`). `--standalone` gives each run a private server
  (`opencode serve --stdio`, spawned and stopped by the CLI), so a run neither
  depends on nor changes the user's service.
- Workspace and harness: shared with v1 (`OpencodeWorkspace`). The same
  `.opencode/` rebuild, the same `.opencode/agents/kompanion.md`, the same
  harness check (`.opencode/` or `AGENTS.md`), and the same `SkillLayout`
  entries. `--agent kompanion` was checked to pick up that file on v2.

**Events.** The success events are v1's, plus a top-level `sessionID` on every
line:

| `type` | `part` holds |
| --- | --- |
| `step_start` | `type: "step-start"` |
| `tool_use` | `tool`, `state: {status, input, output, title}` (born completed) |
| `step_finish` | `reason`, `cost`, `tokens: {input, output, reasoning, cache: {read, write}}` |
| `text` | `text` |
| `error` | no part: `error: {type, message}` (flat, unlike v1's `{name, data.message}`) |

Recorded fixtures: `server-kotlin/src/test/resources/opencode2/`.

**The last step has no `step_finish`.** In every run we recorded, the final
step (the one that writes the answer) ends without a `step_finish`, so the
step sum is short. One real run: the steps add up to $0.001856, but the session
cost is $0.002037. So `Opencode2Runner.afterRun` runs
`opencode2 session export --standalone <sessionID>` once the process exits. It
keeps only the session's `info.cost`, `info.tokens` and `info.outcome`, and adds
them as one `session_summary` event (ours, not opencode's). That event is
stored and sent over SSE like the others. Cost and tokens on the run come from
it, and the step sum is only the fallback if the export fails. The reducer
does the same: it shows the step sum live, then switches to the session total
when the summary arrives. Zero stays a real cost.

**Errors.** An `error` event fails the run, and its `message` is the summary.
Both shapes we saw end the process with exit code 1:

- `provider.no-route`: `Model unavailable: opencode-go/deepseek-v4-flash`
- `provider.auth`: `Incorrect API key provided: …` (with `status: 401`)

### How a `--standalone` run finds providers and credentials

A standalone server reads the same places as the background service:

- credentials from `~/.local/share/opencode/auth.json` (`opencode auth login`;
  `auth list` shows them as `stored`), plus provider keys in the process
  environment (`OPENAI_API_KEY` and friends; `auth list` shows them as
  `environment`). The CLI inherits the Kompanion server's environment.
- config from `~/.config/opencode/` and `~/.opencode/` (`opencode debug config`
  lists the sources; `opencode debug paths` shows the folders).

So nothing has to be copied into the run. Two things looked like a credentials
problem but are not:

- **`opencode-go/deepseek-v4-flash` fails because the model is gone.** The
  OpenCode Go catalogue no longer has it. It lists `opencode-go/deepseek-v4.1-flash`
  (and `deepseek-v4-pro`), and that id runs fine with `--standalone` using the
  stored OpenCode Go key. The same old id also fails through the background
  service, with the same `provider.no-route`. Fix: change the existing
  "Engineer (opencode)" Agent's model, for example to
  `opencode-go/deepseek-v4.1-flash`, and use the v2 runtime.
- **With no `-m`, v2 picks OpenAI.** `OPENAI_API_KEY` is in the environment, so
  OpenAI is a configured provider and becomes the default. That key is bad, so
  the run fails with `provider.auth`. Set a model on opencode2 Agents, or set
  `model` in `~/.config/opencode/opencode.json`.
- **`opencode models --standalone` prints nothing** on 2.0.26 (we did not find
  out why). Use `opencode models` (through the service) to list
  model ids. They are the same ids a standalone run accepts.

**Gaps, same as v1.** No workspace enforcement hook and no command log
(opencode's extension points are JS/TS plugins the server can't install as a
hook). No cost-cap flag: a team budget is only checked by the pre-flight gate.

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
from the harness or the stored instance, which are neither. `PiRunner` passes
`--skill` for the instance's `.pi/skills` (the harness's own plus the library
skills) and `.claude/skills` when they exist. pi implements the Agent Skills
standard, so a `SKILL.md` written for Claude Code loads unchanged and both
runtimes share one definition.

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

| | claude_code | opencode / opencode2 | pi |
| --- | --- | --- | --- |
| Mechanism | `PreToolUse` hook (`library/hooks/`) | — | blocking `tool_call` extension (`library/pi/`) |
| File tools | confined | unconfined | confined |
| Shell | raw Bash denied; only `exec_in_folder.py` | unconfined | rewritten to `exec_in_folder.py` |
| Command log | `commands.log` | none | `commands.log` |

opencode (v1 and v2) is the one unenforced runtime: its extension points are
JS/TS plugins and a per-agent permission config, with no equivalent the server
can install. A v1 run is scoped by `--dir` and a v2 run by its cwd, and
nothing else. Prefer Claude Code or
pi for agents working in real repositories.

Residual gap, stated rather than hidden: a shell command routed through
`exec_in_folder.py` could overwrite `manifest.json`, since no hook can inspect
arbitrary shell. The blast radius is one run — the server rewrites the manifest
before every run.

---

## Harness layout

One folder can serve every runtime. `library/harnesses/engineer/` is
the reference example.

| Path | Used by |
| --- | --- |
| `CLAUDE.md` | Claude Code system prompt; fallback for opencode and pi |
| `AGENTS.md` | opencode and pi system prompt (in `qa/` it is a symlink to `CLAUDE.md`) |
| `.claude/` | Claude Code: skills, subagents, hooks, settings |
| `.claude/skills/` | also passed to pi with `--skill` |
| `.opencode/` | copied into `<cwd>/.opencode/` for opencode and opencode2 runs |
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
