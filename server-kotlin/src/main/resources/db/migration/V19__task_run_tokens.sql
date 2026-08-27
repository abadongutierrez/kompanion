-- Token counts per run, so the UI can show usage next to cost.
--
-- Four columns rather than two, because `input_tokens` alone is actively
-- misleading on Claude Code: it counts only the tokens that were NOT served
-- from cache. Real runs here show 24-66 fresh input against 200k-1.5M cache
-- reads, so displaying that field as "input" would report a run that read
-- 1.5M tokens as having used 66. Anything showing an input total has to add
-- all three.
--
-- They also bill differently — cache reads at 0.1x input, cache writes at
-- 1.25x — which is the other reason to keep them apart rather than summing
-- on the way in.
alter table task_runs add column if not exists input_tokens bigint;
alter table task_runs add column if not exists output_tokens bigint;
alter table task_runs add column if not exists cache_read_tokens bigint;
alter table task_runs add column if not exists cache_write_tokens bigint;

-- Backfill from what was already captured: Claude Code's final result line is
-- stored whole in raw_output, and carries the usage block.
update task_runs
set input_tokens       = (raw_output->'usage'->>'input_tokens')::bigint,
    output_tokens      = (raw_output->'usage'->>'output_tokens')::bigint,
    cache_read_tokens  = (raw_output->'usage'->>'cache_read_input_tokens')::bigint,
    cache_write_tokens = (raw_output->'usage'->>'cache_creation_input_tokens')::bigint
where raw_output->'usage' is not null
  and input_tokens is null;
