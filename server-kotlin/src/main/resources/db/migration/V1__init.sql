create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  discipline text not null,
  reports_to_role_id uuid references roles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  role_id uuid references roles(id) on delete set null,
  title text not null,
  description text,
  type text not null,
  status text not null default 'backlog',
  story_points integer,
  acceptance_criteria text,
  branch_or_pr_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_team_id_idx on tasks(team_id);
create index if not exists tasks_status_idx on tasks(status);
create index if not exists roles_team_id_idx on roles(team_id);
create index if not exists teams_project_id_idx on teams(project_id);
