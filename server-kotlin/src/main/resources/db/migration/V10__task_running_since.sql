-- Whether a Claude run is actually in flight for a Task is server-side
-- state, tracked independently of `status` (a Task can be manually moved to
-- in_progress without a run ever having started). Any client polls this
-- rather than trusting local mutation state, which evaporates on
-- navigation even though the real process keeps running server-side.
alter table tasks add column if not exists running_since timestamptz;
