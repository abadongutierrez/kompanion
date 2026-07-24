create table if not exists task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  status text not null,
  summary text,
  raw_output jsonb,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists task_runs_task_id_idx on task_runs(task_id);
