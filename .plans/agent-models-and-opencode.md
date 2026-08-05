# Agent Models: a first-class, reusable entity for CLI/API agent backends

## Context

Rather than bolting `cliAgent`/`model` fields directly onto `Role`, the
execution backend gets extracted into its own reusable entity — the same
"extract into a first-class, app-wide library" move already applied to
Roles earlier this session (Team-owned → Project-owned →
fully-app-wide). An **Agent Model** describes *how* to run an agent
(Claude Code CLI, OpenCode CLI, and — not built today, but the reason for
this shape — a future Claude API+key backend, etc.); a Role references
one by id instead of embedding backend details inline. Multiple Roles can
share one Agent Model, same relationship shape as Roles↔Teams today.

This still delivers OpenCode as a real, working second backend — real
research/verification, not guessed:

- **Invocation**: `opencode run --format json --dir <cwd> --auto [--model
  <provider/model>]`, prompt via stdin. Confirmed live against the
  installed `opencode` (v1.18.7) binary.
- **Output**: JSONL, `type` ∈ `text`/`step_finish`/`tool_use`/`error`; no
  single final "result" line like Claude Code — summary/cost accumulate
  across every line.
- **Enforcement**: OpenCode's own `permission.external_directory` config
  (pattern-keyed, last-match-wins) — confirmed live that `--auto` +
  `external_directory: {"*": "deny", ...}` in a scoped `XDG_CONFIG_HOME`
  genuinely blocks a write outside the allowed roots while still
  auto-approving ordinary in-workspace tool calls. This is OpenCode's own
  native mechanism, not a port of `exec_in_folder.py` (which is
  Claude-Code-hook-specific and has no OpenCode equivalent).
- **System prompt**: no `--append-system-prompt` — the Role's existing
  `harnessPath`/CLAUDE.md content gets prepended into the stdin prompt
  instead of passed as a separate flag. `harnessPath` stays exactly what
  it is today, fully orthogonal to which Agent Model executes the Role.

Per `AGENTS.md`, all of this lands identically in `server/` and
`server-kotlin/`.

## Scope (what this does *not* do)

Not replicating from the reference Paperclip (`../paperclip`'s
`packages/adapters/opencode-local`, which this was researched against):
remote/sandboxed execution, session resumption, skill injection,
gateway/provider catalogs. Same size/shape as the existing Claude Code
integration — spawn a process, stream into `task_run_events`, extract
summary/cost, enforce the workspace boundary. `otherRepos` each get an
explicit `external_directory` allow entry (OpenCode's permission map
supports this directly).

Only `claude_cli` and `opencode_cli` kinds are implemented now.
`api_key`/base-URL-style fields for a future API-based kind are
deliberately **not** added yet (no kind uses them) — the point of this
change is that adding one later is a new `kind` value plus whatever
columns it actually needs, not a schema fight to retrofit reference-typed
config onto Role.

## Data model

New table + Role FK, migration `0015_agent_models.sql` /
`V15__agent_models.sql` (byte-identical):
```sql
create table if not exists agent_models (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  kind text not null,              -- 'claude_cli' | 'opencode_cli' (app-validated, same convention as tasks.type/status — no CHECK constraint, so adding a kind later needs no migration)
  binary_path text,                -- optional override of the CLI binary location; falls back to a sensible per-kind default if unset
  model text,                      -- provider/model string; used by opencode_cli, ignored by claude_cli
  created_at timestamptz not null default now()
);
create unique index if not exists agent_models_slug_idx on agent_models(slug);

insert into agent_models (title, slug, kind)
values ('Claude Code (CLI)', 'claude-cli', 'claude_cli');

alter table roles add column if not exists agent_model_id uuid references agent_models(id);
update roles set agent_model_id = (select id from agent_models where slug = 'claude-cli')
where agent_model_id is null;
alter table roles alter column agent_model_id set not null;
```

`packages/shared/domain.ts`: new `AgentModel` type `{id, title, slug,
kind, binaryPath, model, createdAt}` (mirrors `Role`'s own shape/style
closely); `CreateAgentModelInput`/`UpdateAgentModelInput` (same
create/edit split pattern as roles — slug auto-derived on create,
directly editable on update, unique app-wide). `Role` gains
`agentModelId: string` (no `cliAgent`/`model` fields on Role at all).

## Backend endpoints (both stacks) — mirrors the Role global-library pattern

- `GET/POST /api/agent-models`, `PATCH /api/agent-models/:id` — no delete
  (same convention as every other library entity: Project/Team/
  Repository/Role).
- `CreateRoleInput`/role create+update endpoints: `agentModelId` replaces
  the harnessPath-adjacent fields; required on create.
- Role read endpoints keep returning a scalar `agentModelId` (not a
  nested/resolved object) — same pattern `RolesPanel.tsx` already uses
  for `harnessPath`; the UI fetches `/api/agent-models` once and joins
  client-side for display, exactly like it already does for the
  assign-existing-role picker.

## Runner changes (both `server/` and `server-kotlin/`)

Where a task run currently loads its `role` and calls
`runClaudeStreaming` directly: first load the referenced `AgentModel`
row, then branch on `agentModel.kind`:

- **`claude_cli`**: unchanged `runClaudeStreaming`, except the binary
  resolution becomes `agentModel.binaryPath ?? process.env.CLAUDE_BIN ??
  "claude"` (was just `process.env.CLAUDE_BIN ?? "claude"` — purely
  additive, existing behavior preserved when `binaryPath` is unset, which
  it is for the seeded default row).
- **`opencode_cli`**: new `runOpenCodeStreaming(prompt, cwd, runId,
  harnessSystemPrompt, taskWorkspaceDir, otherRepoDirs, agentModel)`:
  1. Prompt = `harnessSystemPrompt + "\n\n" + prompt`.
  2. Write a scoped `opencode.json` to a fresh temp dir, used as
     `XDG_CONFIG_HOME` for this child process only:
     ```json
     { "permission": { "external_directory": { "*": "deny", "<otherRepoDir>/**": "allow", ... } } }
     ```
     (one allow entry per `otherRepos` entry; just `{"*": "deny"}` when none).
  3. Spawn `<agentModel.binaryPath ?? "opencode"> run --format json --dir
     <cwd> --auto` (+ `--model <agentModel.model>` if set), stdin = the
     combined prompt.
  4. Stream stdout line-by-line: each parsed JSON line persists to
     `task_run_events` and publishes to `RunEventsBus` immediately —
     identical live-transcript wiring to the Claude path, this doesn't
     change.
  5. Accumulate across all lines (reimplemented directly, not copied from
     the reference's `parseOpenCodeJsonl`): `text` → append to summary;
     `step_finish` → add `part.cost` to a running total; `error` →
     capture as the failure reason.
  6. `rawOutput` has no natural single "final line" — synthesize
     `{summary, costUsd, errorMessage}` and store that as the run's
     `raw_output`, preserving its meaning across both backends.
  7. Clean up the temp `XDG_CONFIG_HOME` dir in a `finally`.
- Skip Claude-specific `copyHarnessSkills`/`installCwdEnforcement`
  (`.claude/` + hook wiring) entirely when `kind == "opencode_cli"` — the
  scoped `opencode.json` step above is OpenCode's analog.
  `manifest.json` is still written either way (our own bookkeeping,
  backend-agnostic).

## UI

- New `AgentModelsPage.tsx` at a new root route `/agent-models`, same
  list+create+edit pattern as `RolesLibraryPage.tsx` (title, slug, kind
  select, binaryPath + model inputs shown contextually by kind). Header
  nav (`App.tsx`) gains a third link: `Projects | Roles | Agent Models`.
- `RolesLibraryPage.tsx`'s create/edit form: add an `agentModelId`
  `<select>` populated from `/api/agent-models`, required.
- `api.ts`: `listAgentModels`, `createAgentModel`, `updateAgentModel`;
  `CreateRoleInput`/`UpdateRoleInput` carry `agentModelId`.

## Verification

1. Apply the migration to the live dev DB; confirm the seeded
   "Claude Code (CLI)" row exists and all 5 existing roles now have
   `agentModelId` pointing at it; re-run one of the existing Claude-backed
   task runs used throughout this session as a zero-regression check.
2. Create a real `opencode_cli` Agent Model (`model` set to a real id
   from `opencode models`), create a Role using it (reusing an existing
   harness dir's CLAUDE.md), assign to a task linked to a real throwaway
   git repo, trigger a real run on **both** servers:
   - Confirm the file-write + `git commit` actually happens,
     `task_run_events` capture the real JSONL stream, `task_runs.cost_usd`/
     `summary` populate correctly.
   - Confirm `external_directory` deny genuinely blocks a path outside
     the task's allowed roots (same rigor as the `exec_in_folder.py`
     verification).
   - Confirm a task with `otherRepos` can touch the secondary repo (the
     explicit allow entry works) but nothing else.
3. `pnpm typecheck` + Kotlin `gradle build` clean on both stacks; full
   `pnpm test:e2e` green (existing Claude-backed roles unaffected). Add
   plain API-level tests for agent-model CRUD and role↔agent-model
   assignment — no automated opencode e2e test (would spend real money
   every CI run).
