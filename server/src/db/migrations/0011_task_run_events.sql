-- A dumb, ordered, replayable log of exactly what `claude --output-format
-- stream-json` emitted for a run. The server never interprets these rows —
-- reconstruction into renderable transcript blocks happens client-side via
-- the shared reducer in packages/shared/src/runTranscript.ts.
--
-- payload is `text`, not `jsonb`, deliberately: the app's postgres.js client
-- is configured with `transform: postgres.camel`, which deep-transforms
-- nested keys inside JSONB *values* on the way out (not just column names)
-- — that would silently rewrite e.g. `total_cost_usd` to `totalCostUsd`
-- inside a replayed payload while a live (never round-tripped) event keeps
-- the original snake_case Claude actually emitted, breaking the reducer's
-- field matching for replayed history only. Storing/reading it as a plain
-- string sidesteps the transform entirely.
create table if not exists task_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references task_runs(id) on delete cascade,
  seq integer not null,
  payload text not null,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create index if not exists task_run_events_run_id_seq_idx on task_run_events(run_id, seq);
