-- Registers the preflight-check skill (library/skills/preflight-check/) and
-- teaches it to the Engineer. For now only the Engineer has it; other Agents
-- get it on the Agent form when they want it.
--
-- The Engineer is any Agent with the slug `engineer` or `engineer-<variant>`
-- (engineer-opus, engineer-pi, ...). Matching on the harness path instead
-- would also catch every other Agent that reuses the engineer harness, test
-- Agents included. On a fresh database there is none yet and only the skill
-- row is added. name and description are copied from the SKILL.md
-- the same way a scan would; the next scan refreshes them if they drift.
insert into skills (slug, name, description, skill_path)
values (
  'preflight-check',
  'preflight-check',
  'Use at the very start of a Kompanion task, before you plan or change anything, to confirm everything the work needs is in place - the task has what you need to act on, the manifest and task workspace are there, and in a repository the worktree is on the right branch and ready to commit. Stop and report if it fails.',
  'skills/preflight-check'
)
on conflict (slug) do nothing;

insert into agent_skills (agent_id, skill_id)
select a.id, s.id
from agents a, skills s
where s.slug = 'preflight-check'
  and (a.slug = 'engineer' or a.slug like 'engineer-%')
on conflict do nothing;
