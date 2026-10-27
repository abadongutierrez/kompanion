-- Teaches the preflight-check skill (registered in V23) to QA as well. QA
-- runs in the same worktree and task workspace as the Engineer and commits
-- its test code there, so it needs the same checks before it starts.
--
-- QA is any Agent with the slug `qa` or `qa-<variant>` (qa-pi, ...), matched
-- on slug for the same reason V23 gives. On a fresh database there is no
-- such Agent yet and nothing is added.
insert into agent_skills (agent_id, skill_id)
select a.id, s.id
from agents a, skills s
where s.slug = 'preflight-check'
  and (a.slug = 'qa' or a.slug like 'qa-%')
on conflict do nothing;
