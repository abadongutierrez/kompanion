-- Which configured Runtime a run used, stamped at run start next to the
-- `runtime` kind. Two runtimes of one kind (two Claude accounts, say) cost
-- separately, and the kind alone can't tell them apart.
--
-- Null for runs whose Agent names no runtime (they use the CLI defaults) and
-- for every run from before this column. No foreign key on purpose: deleting
-- a runtime must not be blocked by its history, nor erase which runs used it.
alter table task_runs add column if not exists runtime_id uuid;
