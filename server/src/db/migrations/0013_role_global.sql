-- Roles become fully app-wide — no project association at all, the same
-- level as Project itself. Any team in any project can assign any role.
-- Slug uniqueness moves from per-project to app-wide.
drop index if exists roles_project_id_slug_idx;
create unique index if not exists roles_slug_idx on roles(slug);

alter table roles drop column if exists project_id;
