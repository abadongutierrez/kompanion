-- Runtimes can now be of kind opencode2 too (see V26 for agents). The kind
-- check on `runtimes` was written in V25 before the fourth runtime existed.
alter table runtimes drop constraint if exists runtimes_kind_check;
alter table runtimes add constraint runtimes_kind_check
  check (kind in ('claude_code', 'opencode', 'opencode2', 'pi'));
