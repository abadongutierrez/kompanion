-- The skills library, and the record of what each run was built from.
--
-- A skill is a folder on disk (SKILL.md plus files). This table only points at
-- it: skill_path is absolute, or relative to LIBRARY_ROOT, the same rule an
-- Agent's harness_path follows. name and description are copied out of the
-- SKILL.md frontmatter so lists don't have to read the disk; a scan refreshes
-- them.
create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  skill_path text not null,
  created_at timestamptz not null default now()
);

-- Which skills an Agent has been taught. restrict on the skill side: a skill
-- that is still assigned cannot be deleted out from under its Agents (the use
-- case checks first and says which Agents, this is the backstop).
create table if not exists agent_skills (
  agent_id uuid not null references agents(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (agent_id, skill_id)
);

-- What each run was built from. instance_hash names the stored agent instance
-- (WORKSPACE_ROOT/agent-instances/<hash>). git_sha and git_dirty say which
-- commit of the library it came from and whether anything was uncommitted;
-- both are null when the library is not in a git repo.
alter table task_runs add column if not exists instance_hash text;
alter table task_runs add column if not exists git_sha text;
alter table task_runs add column if not exists git_dirty boolean;

-- One row per assigned skill per run: what became of it. skill_hash is null
-- when the folder was missing.
create table if not exists task_run_skills (
  run_id uuid not null references task_runs(id) on delete cascade,
  skill_slug text not null,
  skill_hash text,
  outcome text not null check (outcome in ('loaded', 'skipped_harness_has_it', 'missing')),
  primary key (run_id, skill_slug)
);
