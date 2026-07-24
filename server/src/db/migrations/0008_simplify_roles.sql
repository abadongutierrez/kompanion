-- A Role is now just: title, a stable slug, and the harness folder it points
-- to. No discipline, no reporting hierarchy — harnessPath is the only source
-- of a Role's harness, with no discipline-keyed fallback convention.
alter table roles add column if not exists slug text;

update roles
set slug = lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
where slug is null;

alter table roles alter column slug set not null;

create unique index if not exists roles_team_id_slug_idx on roles(team_id, slug);

alter table roles drop column if exists discipline;
alter table roles drop column if exists reports_to_role_id;
