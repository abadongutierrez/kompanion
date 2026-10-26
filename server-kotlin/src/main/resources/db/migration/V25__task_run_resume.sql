-- Resuming a run: continuing the CLI session a finished run left behind.
--
-- session_id is the CLI's own session id, stored the moment the CLI reports
-- it (Claude Code's first stream-json event, system/init), so resume never
-- has to scan task_run_events for it. session_store is where that CLI kept
-- the session file when the run started (for Claude Code, CLAUDE_CONFIG_DIR
-- or ~/.claude): a resume under a different config directory would not find
-- the session, so it is refused instead.
--
-- resumed_from_run_id links a resumed run to the run whose session it
-- continued. set null rather than cascade: deleting history must not take
-- the newer run with it.
alter table task_runs add column if not exists session_id text;
alter table task_runs add column if not exists session_store text;
alter table task_runs add column if not exists resumed_from_run_id uuid
  references task_runs(id) on delete set null;
