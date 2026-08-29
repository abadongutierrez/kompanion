-- A third runtime: pi (https://github.com/earendil-works/pi-mono), added
-- mainly to run local models served by LM Studio.
--
-- Only the check constraint changes. runtime/model stay free text for the
-- same reasons V18 gave: pi's model ids carry a provider prefix
-- (`lmstudio/qwen3.8-27b`), which no per-runtime enum could keep up with.
alter table agents drop constraint if exists agents_runtime_check;
alter table agents add constraint agents_runtime_check
  check (runtime in ('claude_code', 'opencode', 'pi'));
