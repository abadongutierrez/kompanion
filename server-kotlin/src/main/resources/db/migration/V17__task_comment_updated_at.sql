-- Operators can edit their own comments. updated_at stays null until the
-- first edit, so the UI can tell an untouched comment from an edited one.
alter table task_comments add column if not exists updated_at timestamptz;
