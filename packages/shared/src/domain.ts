import { z } from "zod";

export const TaskType = z.enum(["story", "bug", "chore", "spike"]);
export type TaskType = z.infer<typeof TaskType>;

export const TaskStatus = z.enum([
  "backlog",
  "in_progress",
  "in_review",
  "blocked",
  "done",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

// Allowed forward transitions in the task state machine. "blocked" can be
// entered from or exited back to any non-terminal status, so it isn't a
// linear step — it's handled separately in TASK_STATUS_TRANSITIONS below.
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "backlog",
  "in_progress",
  "in_review",
  "done",
];

export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ["in_progress"],
  in_progress: ["in_review", "blocked", "backlog"],
  in_review: ["done", "in_progress", "blocked"],
  blocked: ["in_progress", "in_review", "backlog"],
  done: [],
};

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  // The folder this Project's Tasks get their workspaces under:
  // <workspacePath>/tasks/<taskId>/. Absolute, or relative to the server's
  // WORKSPACE_ROOT — the same storage rule an Agent's harnessPath follows.
  workspacePath: z.string(),
  createdAt: z.string(),
});
export type Project = z.infer<typeof Project>;

export const Team = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  monthlyBudgetUsd: z.number().nullable(),
  createdAt: z.string(),
});
export type Team = z.infer<typeof Team>;

// An Agent is deliberately minimal: a name, a stable identifier, and the
// local folder its harness (.claude/ skills, subagents, hooks) lives in.
// harnessPath is the sole source of an Agent's harness — there's no
// discipline-keyed fallback convention. Note the level difference the
// shared word hides: the .claude/agents/*.md inside a harness are Claude
// Code subagents spawned *within* one of our Agents' runs.
//
// Agents are fully app-wide — the same level as Project itself, with no
// project (or team) association at all. Create one once in the global
// Agent library, then assign it to whichever Teams in whichever Projects
// want it (see team_agents). This makes sharing a harnessPath/CLAUDE.md an
// intentional, visible action instead of an accident of two Teams
// pointing at the same directory.
// Which CLI runs an Agent. The harness folder can carry every layout at once
// (CLAUDE.md + .claude/ for one, AGENTS.md + .opencode/ for another, plus
// pi-agent/ for pi), so switching runtime doesn't necessarily mean a
// different folder.
export const AgentRuntime = z.enum(["claude_code", "opencode", "pi"]);
export type AgentRuntime = z.infer<typeof AgentRuntime>;

export const AGENT_RUNTIME_LABEL: Record<AgentRuntime, string> = {
  claude_code: "Claude Code",
  opencode: "opencode",
  pi: "pi",
};

export const Agent = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  harnessPath: z.string(),
  runtime: AgentRuntime,
  // null means "whatever that CLI defaults to". Id formats differ per
  // runtime — `claude-opus-5` vs opencode's `ollama/qwen2.5-coder:7b` — so
  // this is free text, not an enum that would go stale.
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type Agent = z.infer<typeof Agent>;

export const Repository = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  localPath: z.string(),
  defaultBranch: z.string(),
  gitUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type Repository = z.infer<typeof Repository>;

export const Task = z.object({
  id: z.string(),
  teamId: z.string(),
  agentId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  type: TaskType,
  status: TaskStatus,
  storyPoints: z.number().int().nullable(),
  acceptanceCriteria: z.string().nullable(),
  branchOrPrLink: z.string().nullable(),
  // Set for the duration of an actual Claude invocation, independent of
  // `status` — a Task can be manually moved to in_progress without a run
  // ever starting, so this is the one true "is an agent actually working on
  // this right now" signal, meant to be polled rather than inferred from
  // local UI state.
  runningSince: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof Task>;

// A Task can now link any number of Repositories (one worktree each, same
// branch) — this is returned alongside a Task rather than being a column on
// it, since it's a many-to-many relation (task_repositories join table).
export const TaskWithRepositories = Task.extend({
  repositoryIds: z.array(z.string()),
});
export type TaskWithRepositories = z.infer<typeof TaskWithRepositories>;

export const TaskDependencyType = z.enum([
  "blocked_by",
  "depends_on",
  "relates_to",
]);
export type TaskDependencyType = z.infer<typeof TaskDependencyType>;

export const TaskDependency = z.object({
  id: z.string(),
  taskId: z.string(),
  relatedTaskId: z.string(),
  relatedTaskTitle: z.string(),
  type: TaskDependencyType,
  createdAt: z.string(),
});
export type TaskDependency = z.infer<typeof TaskDependency>;

export const CreateTaskDependencyInput = z.object({
  relatedTaskId: z.string(),
  type: TaskDependencyType,
});
export type CreateTaskDependencyInput = z.infer<typeof CreateTaskDependencyInput>;

// workspacePath is optional: omitted, the server picks one under its
// WORKSPACE_ROOT from the project name, and creates the folder.
export const CreateProjectInput = Project.pick({ name: true }).extend({
  workspacePath: z.string().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const CreateTeamInput = Team.pick({ name: true }).extend({
  projectId: z.string(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInput>;

// Creates an Agent in the app-wide agent library — POST /api/agents.
export const CreateAgentInput = Agent.pick({
  title: true,
  harnessPath: true,
}).extend({
  runtime: AgentRuntime.optional(),
  model: z.string().nullable().optional(),
});
export type CreateAgentInput = z.infer<typeof CreateAgentInput>;

// POST /api/teams/:teamId/agents — assign an existing Agent to this team.
// Agents are only ever created via the global /api/agents library; within a
// team's context it's assignment-only.
export const AssignAgentInput = z.object({
  agentId: z.string(),
});
export type AssignAgentInput = z.infer<typeof AssignAgentInput>;

// PATCH /api/agents/:agentId — edits the shared Agent itself (affects every
// Team it's assigned to). slug is only touched when explicitly provided —
// unlike creation, editing never silently re-derives it from a title change.
export const UpdateAgentInput = Agent.pick({
  title: true,
  slug: true,
  harnessPath: true,
  runtime: true,
  model: true,
}).partial();
export type UpdateAgentInput = z.infer<typeof UpdateAgentInput>;

// A skill: a folder on disk (SKILL.md plus files) that can be taught to
// Agents. The row only points at it; broken is true when the folder is gone or
// no longer valid, and problem says why. name and description are copied from
// the SKILL.md frontmatter.
export const Skill = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  skillPath: z.string(),
  broken: z.boolean(),
  problem: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Skill = z.infer<typeof Skill>;

// GET /api/skills/:id — the skill plus the text of its SKILL.md (null when the
// file is gone).
export const SkillDetail = z.object({
  skill: Skill,
  body: z.string().nullable(),
});
export type SkillDetail = z.infer<typeof SkillDetail>;

// POST /api/skills — register one skill folder, absolute or relative to the
// library root.
export const RegisterSkillInput = z.object({ path: z.string() });
export type RegisterSkillInput = z.infer<typeof RegisterSkillInput>;

// POST /api/skills/scan — what a scan did.
export const SkillScanResult = z.object({
  registered: z.array(Skill),
  refreshed: z.array(Skill),
  broken: z.array(Skill),
});
export type SkillScanResult = z.infer<typeof SkillScanResult>;

// One skill an Agent has been taught. shadowedByHarness: the Agent's harness
// already carries a skill with this slug, so at run time the harness copy wins
// and this one is skipped.
export const AgentSkill = z.object({
  skill: Skill,
  shadowedByHarness: z.boolean(),
});
export type AgentSkill = z.infer<typeof AgentSkill>;

// PUT /api/agents/:agentId/skills — replaces the Agent's whole set of skills.
export const AssignSkillsInput = z.object({ skillIds: z.array(z.string()) });
export type AssignSkillsInput = z.infer<typeof AssignSkillsInput>;

// GET/PATCH .../agents/:agentId/harness-template — the agent's CLAUDE.md
// content, read/written as plain text (never parsed).
export const HarnessTemplate = z.object({
  content: z.string(),
});
export type HarnessTemplate = z.infer<typeof HarnessTemplate>;

export const BuiltinHarness = z.object({
  slug: z.string(),
  title: z.string(),
  path: z.string(),
});
export type BuiltinHarness = z.infer<typeof BuiltinHarness>;

export const CreateTaskInput = Task.pick({
  title: true,
  type: true,
}).extend({
  teamId: z.string(),
  agentId: z.string().nullable().optional(),
  repositoryIds: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  storyPoints: z.number().int().nullable().optional(),
  acceptanceCriteria: z.string().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const CreateRepositoryInput = Repository.pick({
  name: true,
  localPath: true,
}).extend({
  projectId: z.string(),
  defaultBranch: z.string().optional(),
  gitUrl: z.string().nullable().optional(),
});
export type CreateRepositoryInput = z.infer<typeof CreateRepositoryInput>;

export const UpdateRepositoryInput = Repository.pick({
  name: true,
  localPath: true,
  defaultBranch: true,
}).extend({
  gitUrl: z.string().nullable().optional(),
}).partial();
export type UpdateRepositoryInput = z.infer<typeof UpdateRepositoryInput>;

export const UpdateTaskStatusInput = z.object({
  status: TaskStatus,
});
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInput>;

export const UpdateTaskInput = z.object({
  title: z.string().optional(),
  type: TaskType.optional(),
  description: z.string().nullable().optional(),
  storyPoints: z.number().int().nullable().optional(),
  acceptanceCriteria: z.string().nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

export function isValidTaskTransition(
  from: TaskStatus,
  to: TaskStatus,
): boolean {
  if (from === to) return true;
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

// "running" covers the window between a run starting and it reaching a
// terminal outcome — the row exists from the first moment (not just at the
// end) so task_run_events has a run_id to attach to as soon as streaming
// starts.
export const TaskRunStatus = z.enum([
  "running",
  "succeeded",
  "failed",
  "over_budget",
]);
export type TaskRunStatus = z.infer<typeof TaskRunStatus>;

// What became of one skill an Agent had when a run was built. loaded: it went
// into the run. skipped_harness_has_it: the harness already carried a skill
// with that slug, and the harness wins. missing: its folder was gone, so the
// run went on without it (hash is null then).
export const SkillOutcome = z.enum(["loaded", "skipped_harness_has_it", "missing"]);
export type SkillOutcome = z.infer<typeof SkillOutcome>;

export const SKILL_OUTCOME_LABEL: Record<SkillOutcome, string> = {
  loaded: "loaded",
  skipped_harness_has_it: "skipped — the harness already has it",
  missing: "missing — folder not found",
};

export const RunSkill = z.object({
  slug: z.string(),
  hash: z.string().nullable(),
  outcome: SkillOutcome,
});
export type RunSkill = z.infer<typeof RunSkill>;

export const TaskRun = z.object({
  id: z.string(),
  taskId: z.string(),
  agentId: z.string(),
  // Denormalized for display, like TaskComment's authorTitle — null when the
  // Agent that served the run has since been deleted from the library.
  agentTitle: z.string().nullable(),
  // The runtime that produced this run, not whatever its Agent is set to
  // now: the transcript reducer is chosen from this, so replaying an old run
  // keeps working after an Agent switches CLI.
  runtime: AgentRuntime,
  model: z.string().nullable(),
  status: TaskRunStatus,
  summary: z.string().nullable(),
  rawOutput: z.unknown().nullable(),
  costUsd: z.number().nullable(),
  durationMs: z.number().int().nullable(),
  // Cache reads and writes are kept apart from inputTokens because they bill
  // differently, and because inputTokens counts only what was NOT served from
  // cache. Use totalInputTokens() rather than inputTokens for display.
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cacheReadTokens: z.number().nullable(),
  cacheWriteTokens: z.number().nullable(),
  // What the run was built from — see RunSkill and the agent instance. null
  // hash for a run from before agent instances existed, or one refused before
  // it started. gitSha and gitDirty are null when the library was not in a
  // git repo. dirty means something in the harness or the skills it used had
  // uncommitted changes, so the commit alone would not reproduce the run.
  instanceHash: z.string().nullable(),
  gitSha: z.string().nullable(),
  gitDirty: z.boolean().nullable(),
  skills: z.array(RunSkill),
  createdAt: z.string(),
});
export type TaskRun = z.infer<typeof TaskRun>;

// One day's spend within the current month. `day` is an ISO date in UTC,
// matching how the month window itself is computed server-side.
export const DailySpend = z.object({
  day: z.string(),
  spendUsd: z.number(),
  runCount: z.number().int(),
});
export type DailySpend = z.infer<typeof DailySpend>;

export const UpdateTeamBudgetInput = z.object({
  monthlyBudgetUsd: z.number().positive().nullable(),
});
export type UpdateTeamBudgetInput = z.infer<typeof UpdateTeamBudgetInput>;

export const TeamSpend = z.object({
  teamId: z.string(),
  monthlyBudgetUsd: z.number().nullable(),
  spendUsd: z.number(),
  periodStart: z.string(),
});
export type TeamSpend = z.infer<typeof TeamSpend>;

// What a whole project has cost, across every team under it. The total is
// all-time — the question the Budget tab asks — while monthSpendUsd and
// byDay cover the current month, which is the window the per-team budget
// caps in TeamSpend are enforced over.
export const ProjectSpend = z.object({
  projectId: z.string(),
  totalSpendUsd: z.number(),
  totalRunCount: z.number().int(),
  monthSpendUsd: z.number(),
  periodStart: z.string(),
  byDay: z.array(DailySpend),
});
export type ProjectSpend = z.infer<typeof ProjectSpend>;

// A comment's @mentions are resolved on read against the team's current
// Agent slugs rather than stored — so an agent rename doesn't strand old
// mentions pointing at a stale identifier.
export const MentionedAgent = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
});
export type MentionedAgent = z.infer<typeof MentionedAgent>;

export const TaskComment = z.object({
  id: z.string(),
  taskId: z.string(),
  agentId: z.string().nullable(),
  authorTitle: z.string().nullable(),
  body: z.string(),
  mentionedAgents: z.array(MentionedAgent),
  createdAt: z.string(),
  // Null until an Operator edits the comment.
  updatedAt: z.string().nullable(),
});
export type TaskComment = z.infer<typeof TaskComment>;

export const CreateTaskCommentInput = z.object({
  agentId: z.string().nullable().optional(),
  body: z.string().min(1),
});
export type CreateTaskCommentInput = z.infer<typeof CreateTaskCommentInput>;

// Only the body is editable, and only on Operator-authored comments — an
// agent's comment is the record of what its run reported.
export const UpdateTaskCommentInput = z.object({
  body: z.string().min(1),
});
export type UpdateTaskCommentInput = z.infer<typeof UpdateTaskCommentInput>;
