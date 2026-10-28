-- The comment whose "Run as <agent>" button started this run. Lets the
-- comment thread show which runs a comment already triggered, and disable
-- the button for them. Null for runs not started from a comment.
alter table task_runs
    add column if not exists trigger_comment_id uuid references task_comments(id) on delete set null;
