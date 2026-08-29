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

## Agents, not Roles

The entity formerly called `Role` is now `Agent` (migration `V15`). It had
already shed `discipline`, `reportsToRoleId`, and team/project ownership,
leaving `title` + `slug` + `harnessPath` — an agent definition, not a
position on an org chart. DESIGN.md's original Role/Actor split was never
built and isn't coming back.

Watch the level collision the shared word hides: `.claude/agents/*.md`
inside a harness are Claude Code **subagents**, spawned within one of our
Agents' runs. Call those subagents in prose; `Agent` (capitalized) always
means the app entity. Harness directories on disk keep their old names
(`engineer/`, `qa/`, `product_manager/`, `project_manager/`) — an Agent
points at one by absolute path, so the folder name carries no meaning.

## Workspaces

A Project names a folder when it is created (`projects.workspace_path`, V21) —
absolute, or relative to `WORKSPACE_ROOT`, the same storage rule an Agent's
`harnessPath` follows. Leave it blank in the UI and the server uses
`projects/<slug>-<id8>` under `WORKSPACE_ROOT` and creates it.

Each Task gets `<project workspace>/tasks/<taskId>/`. That folder is:

- **the agent's**, not just the platform's. It is an allowed root in
  `manifest.json`, so an agent can write there even when a repository is
  linked and the cwd is a worktree somewhere else entirely. Plans, notes,
  test plans, verdicts and anything handed to the next agent belong there —
  they are a record of the run, not part of the deliverable, and are never
  committed.
- **shared** across agents and runs on that task, which is what makes an
  Engineer → Coder or Engineer → QA handoff work.
- **also ours**: `manifest.json`, `commands.log`, `activity.log` and
  `pi-sessions/` live in it. `manifest.json` is read-only to the agent — both
  enforcement paths deny a file-tool write to it, because it is where they read
  their own allowed roots from. A shell command routed through
  `exec_in_folder.py` could still overwrite it; no hook can inspect arbitrary
  shell. The blast radius is one run, since the server rewrites the manifest
  before every run. Making that airtight means moving our metadata out of the
  agent-writable root, which we have not done.

Tasks created before V21 keep their old folder under `WORKSPACE_ROOT/tasks/`:
`ClaudeHarnessService.resolveWorkspaceDir` falls back to it when it exists, so
their history and prior runs stay where the agents left them.

The prompt tells the agent both directories — a `Workspace:` line for the cwd
and a `Task workspace:` line for the folder above — and the harness texts and
skills repeat the split. Change one, change the others.

## Agent runtimes

An Agent names the CLI it runs on (`agents.runtime`) and optionally a model
(`agents.model`, free text — the id formats differ per CLI). Three runtimes
exist: `claude_code`, `opencode` and `pi`. Adding a fourth means adding an
`AgentRunner` `@Component` under `service/runner/`; `RunTaskService` keeps
everything runtime-agnostic and resolves runners from injected beans, and so
does `GlobalAgentsController`'s harness validation.

A harness folder can serve all three — `CLAUDE.md` + `.claude/` for Claude
Code, `AGENTS.md` + `.opencode/` for opencode, `AGENTS.md` + `pi-agent/` for
pi. `workspace/harnesses/engineer/` carries every layout and is the reference
example.

The full reference — exact command lines, what each CLI is sent, the event
shapes, the enforcement comparison, and how to add a fourth runtime — is
[docs/agent-runtimes.md](docs/agent-runtimes.md). Keep it in sync when a
runner changes.

### pi

pi (https://github.com/earendil-works/pi-mono) runs headless as
`pi -p --mode json`, verified against 0.84.3. It is the runtime for local
models: `pi-agent/` inside a harness is a pi *agent-config directory*
(`models.json`, `settings.json`), copied into the task workspace each run and
pointed at with `PI_CODING_AGENT_DIR`, because pi reads custom providers only
from there and has no project-level equivalent. The engineer harness ships an
LM Studio provider that way — its `baseUrl` is a WSL-to-Windows host address
and will differ per machine. Without a `pi-agent/` folder pi falls back to the
server user's `~/.pi/agent`.

A pi run writes nothing into the repository it works on: the harness AGENTS.md
goes in through `--append-system-prompt`, the enforcement extension is loaded
from an absolute path, and sessions land in the task workspace.

Model ids carry the provider prefix (`lmstudio/qwen3.8-27b`). pi has no
cost-cap flag, so a team budget is only enforced by the pre-flight gate — same
gap as opencode. Local models are slow; `CLAUDE_RUN_TIMEOUT_MS` (default 30
minutes) is the ceiling to raise if runs get killed mid-answer.

`task_runs` stores `runtime` and `model` as well, stamped when the run
starts. That is not redundant with the Agent: replaying a stored transcript
means picking the reducer that matches the event shape, and an Agent can be
switched to another CLI afterwards.

### opencode runs are not enforced

**Known and accepted asymmetry, and opencode is now the only one.** Claude
Code runs are confined by the `PreToolUse` hook in `workspace/hooks/`: raw
Bash is denied, everything goes through `exec_in_folder.py`, which checks
folder membership and appends to `commands.log`. pi runs get the same
guarantee from `workspace/pi/enforce-workspace.ts`, an extension loaded with
`-e`: pi's `tool_call` event can block a call and mutate its input, so file
tools are held to the roots in `manifest.json` and every `bash` call is
rewritten to run through that same `exec_in_folder.py`.

For pi the extension is installed twice, deliberately: on the command line
with `-e`, and into the run's config directory at `pi-agent/extensions/`.
Only the second one reaches a child pi process — anything that spawns
subagents builds the child's argv itself and forwards none of ours, so a
child would otherwise run unconfined. Loading it twice is safe: the path
rewrite is idempotent and the bash wrap detects itself.

opencode has no equivalent the server can install — its extension points are
JS/TS plugins and a per-agent permission config — so an opencode run is scoped
by `--dir` and nothing else, with no command log.

Prefer Claude Code or pi for agents working in real repositories. If opencode
enforcement is needed later, the shape would be a plugin under
`.opencode/plugin/` materialized by `OpencodeRunner.prepareWorkspace` the way
the hook files are copied today.
