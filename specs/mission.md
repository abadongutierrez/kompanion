# Mission

## What Kompanion is

Kompanion runs AI coding agents as a **software development team**. You
define Projects, Teams, Agents and Tasks. Running a Task hands it to an agent
CLI (Claude Code, opencode or pi) inside a real git worktree.

## Why it exists

Generic agent orchestration (org → agent → goal → ticket) fits any business,
and that costs the structure a dev team needs. Kompanion keeps the mechanics
that are domain-agnostic (heartbeats, budgets, audit trails, workspaces) and
puts a delivery-shaped model on top: tasks with acceptance criteria and
points, branch/PR linkage, review gates, QA handoff.

## Who it is for

A single operator (a developer) running a small team of agents on their own
machine, against their own repos. Not a multi-tenant SaaS.

## Principles

1. **Real work, not demos.** A Task's result is a commit on a branch in a real
   worktree, not a markdown file in a scratch folder.
2. **Agents hand off through the workspace.** Engineer, QA and PM work
   one after another in the same shared Task folder. The folder is the record.
3. **Runtime-agnostic.** An Agent names its CLI. No feature may assume Claude
   Code only. Where a runtime cannot enforce a rule, say so plainly.
4. **Safe by default.** Agents are confined to their workspace. Spend is capped
   by budget before a run starts. Task text is prompt content, never shell.
5. **Honest state.** Docs say what is built and what is not.
   `DESIGN.md` is the place for that.
6. **Spec first.** Every non-trivial change starts as a spec in `specs/`,
   then code, then verification against the spec.

## Non-goals (for now)

- Multi-tenant hosting, auth, or concurrent multi-user use.
- Merging branches, opening PRs, or cleaning up worktrees automatically.
- Multi-repo Tasks.
- Replacing human review of what agents ship.
