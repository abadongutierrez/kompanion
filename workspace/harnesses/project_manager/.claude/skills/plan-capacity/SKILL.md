---
name: plan-capacity
description: Use this whenever you've been handed a Project Manager Task (e.g. "plan team capacity", "assess parallelization"). Reads the prompt's Team snapshot section — every Agent's load and every Task's status/dependencies — and produces a capacity/parallelization plan in the current directory.
---

Plan capacity for the team described in the prompt's `Team snapshot:` section:

1. Delegate to the `dependency-mapper` subagent first: give it the Team snapshot's task list and get back which Tasks are actually blocked vs. free to start.
2. Write `capacity-plan.md`:
   - Which Tasks can run in parallel right now (not blocked, distinct Agents).
   - Which Tasks are stuck waiting on a blocker, and on what.
   - Per-Agent load assessment: is any Agent's current in-progress count a bottleneck relative to how much backlog is queued for it?
   - An explicit recommendation: does the team need another Engineer, QA, or other Agent to make progress, or is current capacity sufficient? Say so plainly either way — "no change needed" is a valid, useful recommendation.
3. Write `dependency-map.md` with the subagent's raw blocking-chain output, so a human can audit the reasoning.
4. This is advisory only — never claim to have created an Agent, reassigned a Task, or changed anything. You're producing a recommendation, not taking an action.
5. Keep it short. This is a proof-of-mechanism run, not a full PMO report — a clear, complete capacity-plan.md is enough.
