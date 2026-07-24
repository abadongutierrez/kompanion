alter table tasks add column if not exists blocked_by_task_id uuid references tasks(id) on delete set null;

create index if not exists tasks_blocked_by_task_id_idx on tasks(blocked_by_task_id);
