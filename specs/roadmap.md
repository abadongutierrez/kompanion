# Roadmap

Status is taken from `DESIGN.md` and the git log. Each item becomes a spec in
`specs/<nn>-<slug>/` before work starts.

## Done

- Domain model: Project, Team, Agent, Task, task state machine.
- Agent harnesses (engineer, qa, product_manager) and shared Task workspaces.
- Three runtimes: Claude Code, opencode, pi.
- Project workspace folders, and per-Task folders agents can write in.
- Heartbeat scheduler (off by default).
- Budget enforcement per Team, and a Project spend rollup.
- UI reorganised into feature slices.
- Library and workspace roots: tracked templates in `library/`
  (`LIBRARY_ROOT`), generated data in `WORKSPACE_ROOT` (default
  `~/.kompanion/workspace`), and `bin/migrate-workspace` to move old data.
  Spec: `specs/2026-09-30-library-and-workspace-roots/`.

## Next

Listed in priority order, top first.

### Company

The isolation boundary: a `companies` table and `projects.company_id`.

### Repositories and worktrees

A Project owns repos. A Task targets one repo and runs in a `git worktree` on
its own branch. Populate `branchOrPrLink`.

### Review gates

A distinct approval action for `in_review → done`, with an optional required
reviewer Agent.

### Skills library

A shared repository of skills that can be assigned ("taught") to Agents.

- Skills live on the filesystem as standard skill folders (`SKILL.md` plus
  files), under `library/skills/<slug>/`, next to `library/harnesses/`. A
  `skills` row holds a path, like an Agent's `harnessPath`: relative to
  `LIBRARY_ROOT` for anything under `library/`, or absolute for a skill
  living elsewhere. `agent_skills` links Agents to skills.
- Agent instances. At run start, each runner's `prepareWorkspace` builds an
  agent instance: the harness plus the assigned skills, laid out the way that
  runtime loads them. Each runtime differs in how it loads skills and the
  rest:
  - Claude Code: `.claude/skills/<slug>/`.
  - pi: a skills folder passed with `--skill`. pi implements the same Agent
    Skills standard, so one `SKILL.md` serves both.
  - opencode: its own skills folder under `.opencode/`. To be confirmed in
    the spec, since `OpencodeRunner` does not handle skills today.
- Agent instances are stored. The built instance is hashed as one unit and
  stored once by hash, so runs with no changes share one folder. The live
  copy is built from the stored agent instance. Each run records:
  - `instance_hash`, pointing at its agent instance;
  - `git_sha` of the repo commit the harness and skills came from, when they
    live in this repo, and `git_dirty` when there were uncommitted edits;
  - the slug and hash of every skill it loaded, for display on the run page.

  Git history says how harnesses and skills changed over time. The agent
  instance says exactly what a run used, including skills kept outside the repo. To
  decide in the spec: retention.

  The store is `agent-instances/<hash>/`, global rather than per project, so
  identical instances share one folder. Each folder holds the instance in its
  runtime's layout, plus an `instance.json` (runtime, created at) that is not
  part of the hash. It lives under `WORKSPACE_ROOT`, with the other generated
  files. An instance with no `task_runs` row pointing
  at its hash can be deleted.
- Teaching skills to an Agent: the create and edit Agent forms get a "Skills"
  section. It lists the skills in the library, and the user picks the ones the
  Agent should learn. Saving the Agent writes its `agent_skills` rows. Removing
  a skill from the list un-teaches it from the next run on.
- First skill, `kompanion-context`: teaches an Agent to read the run's
  `manifest.json` through read-only shim commands (worktree, task workspace,
  branch, other repos, allowed roots). The script lives in the skill folder
  and reads `$TASK_WORKSPACE_DIR/manifest.json`. It is a normal library skill,
  assigned like any other. To confirm in the spec: that shell enforcement
  lets a script under `.claude/skills/` run (`exec_in_folder.py` on Claude
  Code and pi), and that `TASK_WORKSPACE_DIR` reaches subagents and child
  processes.
- v1: all three runtimes (Claude Code, opencode, pi), register by path plus a
  scan button, read-only skill content in the UI.

## Later

- Objectives: link Tasks to a Project-level roadmap outcome.
- Atomic task checkout (`FOR UPDATE SKIP LOCKED`) if runs ever go concurrent.
- Worktree cleanup policy.
- PR flow: push, open PR, hook review gates into it.
- Ceremonies (standup, retro, on-call).
- Work Products as a real entity.
- Multi-repo Tasks.
- Skills library extras: per-Project default skills, skill bundles, import
  from a git URL, edit in the UI, replay a run from its stored agent instance.
- Automatic handoff between Agents (for example Engineer → QA) instead of
  manual reassign or mention.

## Open questions

Tracked in `DESIGN.md` under "Open questions". Resolve them in a spec, then
delete them there.
