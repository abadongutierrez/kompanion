-- Configured runtimes: an installed agent CLI plus how to launch it. Two
-- Claude entries can coexist (say, work and personal), each with its own
-- CLAUDE_CONFIG_DIR, which is the whole reason this is a table and not the
-- CLAUDE_BIN / OPENCODE_BIN / PI_BIN env vars it supersedes.
--
-- kind is the same text agents.runtime holds. binary_path null falls back to
-- the env var, then the bare command on PATH. config_dir is only used by
-- claude_code today (becomes CLAUDE_CONFIG_DIR); other kinds ignore it.
create table if not exists runtimes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('claude_code', 'opencode', 'pi')),
  binary_path text,
  config_dir text,
  created_at timestamptz not null default now()
);
create unique index if not exists runtimes_name_idx on runtimes (lower(name));

-- Optional: an Agent with no runtime_id keeps running exactly as before, on
-- whatever its `runtime` kind resolves to from the environment. No on-delete
-- action, so a runtime cannot be deleted from under an Agent.
alter table agents add column if not exists runtime_id uuid references runtimes (id);
