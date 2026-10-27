-- The agent CLI's OS process, recorded when a run starts. A server killed
-- mid-run can leave that process alive; on the next boot the reconciler uses
-- these to find it and stop it before freeing the task. The start time tells
-- our process apart from an unrelated one that reused the pid.
alter table task_runs add column if not exists pid bigint;
alter table task_runs add column if not exists process_started_at timestamptz;
