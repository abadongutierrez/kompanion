-- A Project now names the folder its Tasks live under, instead of every task
-- in the app sharing one flat WORKSPACE_ROOT/tasks/ directory.
--
-- Stored the same way harnessPath is (see V16): absolute for a folder anywhere
-- on disk, or relative to WORKSPACE_ROOT for the normal case, so the database
-- stays portable across machines and checkouts.
alter table projects add column if not exists workspace_path text;

-- Existing projects get the same default the server computes for a new one:
-- projects/<slug>-<first 8 of id>. The id suffix is what keeps two projects
-- with the same name from sharing a folder.
update projects
set workspace_path = 'projects/'
  || trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
  || '-' || left(id::text, 8)
where workspace_path is null;

alter table projects alter column workspace_path set not null;
