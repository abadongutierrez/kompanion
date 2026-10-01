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
- Skills library and agent instances: shared skills in `library/skills/`, taught
  to Agents on their form, built into a stored, hashed agent instance for every
  run (all three runtimes, harness wins a name clash), with the instance hash,
  library commit and each skill's outcome recorded on the run. First skill:
  `kompanion-context`. Spec: `specs/2026-10-01-skills-library/`.

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

## Later

- Objectives: link Tasks to a Project-level roadmap outcome.
- Atomic task checkout (`FOR UPDATE SKIP LOCKED`) if runs ever go concurrent.
- Worktree cleanup policy.
- PR flow: push, open PR, hook review gates into it.
- Ceremonies (standup, retro, on-call).
- Work Products as a real entity.
- Multi-repo Tasks.
- Make `OpencodeRunner` work with opencode v2: `run` no longer takes `--dir`.
- Skills extras: per-Project default skills, skill bundles, import from a git
  URL, edit a skill in the UI.
- Replay a run from its stored agent instance.
- Clean up agent instances no run points at (nothing deletes them yet).
- Automatic handoff between Agents (for example Engineer → QA) instead of
  manual reassign or mention.

## Open questions

Tracked in `DESIGN.md` under "Open questions". Resolve them in a spec, then
delete them there.
