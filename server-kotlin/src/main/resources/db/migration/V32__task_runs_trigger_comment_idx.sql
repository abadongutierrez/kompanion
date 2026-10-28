-- The comment thread looks up each comment's runs, and the duplicate-run
-- guard on "Run as <agent>" does too. Partial, so runs not started from a
-- comment (most of them) stay out of it.
create index if not exists task_runs_trigger_comment_id_idx
    on task_runs(trigger_comment_id)
    where trigger_comment_id is not null;
