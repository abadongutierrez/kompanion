-- Role becomes Agent. By V13 a Role had already shed everything that made
-- it a *position* — discipline, reporting line, team/project ownership —
-- leaving title + slug + harness_path: a pointer to a harness directory
-- with its own CLAUDE.md, skills and subagents. That is an agent
-- definition, so the name now says so. DESIGN.md's original Role/Actor
-- split (position vs. the instance filling it) never got built and isn't
-- being revived — the survivor of that collapse is what's renamed here.
--
-- Pure rename: no column added or dropped, no data touched. `slug` keeps
-- its exact meaning, so @slug mentions in existing task_comments bodies
-- keep resolving.
--
-- Note the deliberate collision this leaves alone: a harness directory
-- still contains `.claude/agents/*.md`. Those are Claude Code *subagents*
-- spawned inside one of our Agents' runs — a different thing at a
-- different level, and the harness layout on disk is untouched here.
alter table roles rename to agents;
alter index roles_pkey rename to agents_pkey;
alter index roles_slug_idx rename to agents_slug_idx;

alter table team_roles rename to team_agents;
alter table team_agents rename column role_id to agent_id;
alter index team_roles_pkey rename to team_agents_pkey;

alter table tasks rename column role_id to agent_id;
alter table task_runs rename column role_id to agent_id;
alter table task_comments rename column role_id to agent_id;
