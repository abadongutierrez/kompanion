-- harness_path was stored as an absolute path, which made the database
-- machine-specific: a dump restored on another machine (or a checkout at a
-- different location) pointed every Agent at a directory that doesn't
-- exist. Rewrite paths that live under the repo's workspace/ folder to be
-- relative to WORKSPACE_ROOT, matching how V14 rewrote them when
-- harnesses/ moved.
--
-- Paths outside workspace/ are deliberately left absolute — an operator can
-- still point an Agent at a harness anywhere on disk, and there's nothing
-- to make that relative to. resolveHarnessPath() in ClaudeHarnessService
-- accepts either form: absolute is used as-is, relative resolves against
-- WORKSPACE_ROOT.
update agents
set harness_path = regexp_replace(harness_path, '^.*/workspace/', '')
where harness_path like '/%/workspace/%';
