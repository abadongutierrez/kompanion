-- A fourth runtime: opencode2, for opencode v2. v2 dropped "run --dir" and
-- talks to a shared background service by default, so it gets its own runner
-- (Opencode2Runner) rather than a version switch inside OpencodeRunner, which
-- stays as it is for opencode v1.
--
-- Only the check constraint changes, as in V20.
alter table agents drop constraint if exists agents_runtime_check;
alter table agents add constraint agents_runtime_check
  check (runtime in ('claude_code', 'opencode', 'opencode2', 'pi'));
