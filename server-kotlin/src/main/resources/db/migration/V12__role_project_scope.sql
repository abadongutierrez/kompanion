-- Roles move from being owned by exactly one Team to being owned by the
-- Project, with an explicit team_roles join table tracking which Teams
-- have which Roles assigned. This makes sharing a Role (and its
-- harnessPath/CLAUDE.md) across multiple Teams in the same Project an
-- intentional, first-class action instead of an accident of two Teams
-- happening to point at the same harness directory.
alter table roles add column if not exists project_id uuid references projects(id) on delete cascade;

update roles r set project_id = t.project_id
from teams t where r.team_id = t.id and r.project_id is null;

alter table roles alter column project_id set not null;

create table if not exists team_roles (
  team_id uuid not null references teams(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, role_id)
);

-- Backfill: every role's current team becomes its first assignment, so
-- existing teams/tasks/comments see zero behavior change post-migration.
insert into team_roles (team_id, role_id)
select team_id, id from roles
on conflict do nothing;

drop index if exists roles_team_id_idx;
drop index if exists roles_team_id_slug_idx;
create unique index if not exists roles_project_id_slug_idx on roles(project_id, slug);

alter table roles drop column if exists team_id;
