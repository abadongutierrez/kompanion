create table if not exists task_repositories (
  task_id uuid not null references tasks(id) on delete cascade,
  repository_id uuid not null references repositories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, repository_id)
);

create table if not exists task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  related_task_id uuid not null references tasks(id) on delete cascade,
  type text not null check (type in ('blocked_by', 'depends_on', 'relates_to')),
  created_at timestamptz not null default now(),
  unique (task_id, related_task_id, type)
);

create index if not exists task_dependencies_task_id_idx on task_dependencies(task_id);

-- Backfill from the scalar columns being replaced, then drop them.
insert into task_repositories (task_id, repository_id)
select id, repository_id from tasks where repository_id is not null
on conflict do nothing;

insert into task_dependencies (task_id, related_task_id, type)
select id, blocked_by_task_id, 'blocked_by' from tasks where blocked_by_task_id is not null
on conflict do nothing;

alter table tasks drop column if exists repository_id;
alter table tasks drop column if exists blocked_by_task_id;
