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
export const Agent = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  harnessPath: z.string(),
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

export const CreateProjectInput = Project.pick({ name: true });
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const CreateTeamInput = Team.pick({ name: true }).extend({
  projectId: z.string(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInput>;

// Creates an Agent in the app-wide agent library — POST /api/agents.
export const CreateAgentInput = Agent.pick({
  title: true,
  harnessPath: true,
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
}).partial();
export type UpdateAgentInput = z.infer<typeof UpdateAgentInput>;

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

export const TaskRun = z.object({
  id: z.string(),
  taskId: z.string(),
  agentId: z.string(),
  status: TaskRunStatus,
  summary: z.string().nullable(),
  rawOutput: z.unknown().nullable(),
  costUsd: z.number().nullable(),
  durationMs: z.number().int().nullable(),
  createdAt: z.string(),
});
export type TaskRun = z.infer<typeof TaskRun>;

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
