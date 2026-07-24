create table if not exists repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  local_path text not null,
  default_branch text not null default 'main',
  git_url text,
  created_at timestamptz not null default now()
);

create index if not exists repositories_project_id_idx on repositories(project_id);

alter table tasks add column if not exists repository_id uuid references repositories(id) on delete set null;

create index if not exists tasks_repository_id_idx on tasks(repository_id);
