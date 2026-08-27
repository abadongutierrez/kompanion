-- An Agent now names the CLI it runs on, and optionally the model.
-- Everything before this ran the `claude` binary with Claude Code's flags,
-- hardcoded in RunTaskService — the Agent had no say in how it was invoked.
--
-- model is one nullable free-text column rather than a per-runtime enum: the
-- id formats differ (claude-opus-5 vs opencode's anthropic/claude-opus-5),
-- and null means "whatever the CLI defaults to", which is exactly today's
-- behaviour.
alter table agents add column if not exists runtime text not null default 'claude_code';
alter table agents add column if not exists model text;

alter table agents drop constraint if exists agents_runtime_check;
alter table agents add constraint agents_runtime_check
  check (runtime in ('claude_code', 'opencode'));

-- Denormalized onto the run, and deliberately not just read back through
-- agent_id: replaying a stored transcript means picking the right reducer for
-- the event shape, and an Agent's runtime can be changed after the fact. A
-- run has to carry the runtime that actually produced it — same reasoning as
-- the agent title shown in the runs list.
alter table task_runs add column if not exists runtime text not null default 'claude_code';
alter table task_runs add column if not exists model text;
