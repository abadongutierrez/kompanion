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

## Next

1. **Company** as the isolation boundary (`companies` table,
   `projects.company_id`).
2. **Repositories and worktrees.** A Project owns repos. A Task targets one
   repo and runs in a `git worktree` on its own branch. Populate
   `branchOrPrLink`.
3. **Review gates.** A distinct approval action for `in_review → done`, with
   an optional required reviewer Agent.
4. **Skills library.** A shared repository of skills that can be assigned
   ("taught") to Agents. Skills live on the filesystem as standard skill
   folders (`SKILL.md` plus files); a `skills` row holds a path, like an
   Agent's `harnessPath`. `agent_skills` links Agents to skills. At run
   start, `prepareWorkspace` copies each assigned skill into the run's
   `.claude/skills/<slug>/`, so a run keeps the snapshot it started with.
   Each run records the slug and hash of every skill it loaded. v1: Claude
   Code only, register by path plus a scan button, read-only in the UI.

## Later

- Objectives: link Tasks to a Project-level roadmap outcome.
- Atomic task checkout (`FOR UPDATE SKIP LOCKED`) if runs ever go concurrent.
- Worktree cleanup policy.
- PR flow: push, open PR, hook review gates into it.
- Ceremonies (standup, retro, on-call).
- Work Products as a real entity.
- Multi-repo Tasks.
- Skills library extras: skills for opencode and pi, per-Project default
  skills, skill bundles, import from a git URL, edit in the UI, stored
  snapshots for exact replay.
- Automatic handoff between Agents (for example Engineer → QA) instead of
  manual reassign or mention.

## Open questions

Tracked in `DESIGN.md` under "Open questions". Resolve them in a spec, then
delete them there.
