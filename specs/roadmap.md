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

## Later

- Objectives: link Tasks to a Project-level roadmap outcome.
- Atomic task checkout (`FOR UPDATE SKIP LOCKED`) if runs ever go concurrent.
- Worktree cleanup policy.
- PR flow: push, open PR, hook review gates into it.
- Ceremonies (standup, retro, on-call).
- Work Products as a real entity.
- Multi-repo Tasks.

## Open questions

Tracked in `DESIGN.md` under "Open questions". Resolve them in a spec, then
delete them there.
