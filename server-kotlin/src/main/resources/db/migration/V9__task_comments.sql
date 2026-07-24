-- Task comments carry the agent-to-agent (and operator-to-agent)
-- conversation. Mentions are not stored separately — they're resolved on
-- read by matching @slug patterns in body against the team's current roles.
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  role_id uuid references roles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_id_idx on task_comments(task_id);
