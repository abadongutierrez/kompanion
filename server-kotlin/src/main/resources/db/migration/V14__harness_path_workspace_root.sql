-- harnesses/ moved from each backend's own directory (server/harnesses,
-- server-kotlin/harnesses — byte-identical duplicates kept in sync by
-- hand) into a single shared workspace/harnesses at the repo root. Every
-- existing Role's harness_path is a stored absolute path pointing at one
-- of the old locations — rewrite it to the new one so existing roles
-- don't break once those folders are gone.
update roles
set harness_path = regexp_replace(harness_path, '/server(-kotlin)?/harnesses/', '/workspace/harnesses/')
where harness_path ~ '/server(-kotlin)?/harnesses/';
