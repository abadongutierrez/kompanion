import type {
  AssignAgentInput,
  BuiltinHarness,
  CreateProjectInput,
  CreateRepositoryInput,
  CreateAgentInput,
  CreateTaskCommentInput,
  CreateTaskDependencyInput,
  CreateTaskInput,
  CreateTeamInput,
  HarnessTemplate,
  Project,
  Repository,
  Agent,
  TaskComment,
  TaskDependency,
  TaskRun,
  TaskStatus,
  TaskWithRepositories,
  Team,
  TeamSpend,
  DailySpend,
  UpdateRepositoryInput,
  UpdateAgentInput,
  UpdateTaskCommentInput,
  UpdateTaskInput,
  UpdateTeamBudgetInput,
} from "@kompanion/shared";

export type HeartbeatStatus = {
  enabled: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastRunTaskId: string | null;
  lastError: string | null;
};

const base = "/api";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body.error === "string" ? body.error : JSON.stringify(body.error);
    throw new Error(body.error ? message : res.statusText);
  }
  return res.json();
}

export const api = {
  listProjects: () => request<Project[]>(`${base}/projects`),
  createProject: (input: CreateProjectInput) =>
    request<Project>(`${base}/projects`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  listTeams: (projectId: string) =>
    request<Team[]>(`${base}/projects/${projectId}/teams`),
  createTeam: (input: CreateTeamInput) =>
    request<Team>(`${base}/projects/${input.projectId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name: input.name }),
    }),

  // Agents assigned to a team (join over team_agents server-side).
  listAgents: (teamId: string) => request<Agent[]>(`${base}/teams/${teamId}/agents`),
  assignAgent: (teamId: string, input: AssignAgentInput) =>
    request<Agent>(`${base}/teams/${teamId}/agents`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  unassignAgent: (teamId: string, agentId: string) =>
    fetch(`${base}/teams/${teamId}/agents/${agentId}`, { method: "DELETE" }),

  // The app-wide Agent library — create/edit/the shared CLAUDE.md template
  // all operate here, affecting every team the agent is assigned to,
  // regardless of which project that team belongs to.
  listAllAgents: () => request<Agent[]>(`${base}/agents`),
  createAgent: (input: CreateAgentInput) =>
    request<Agent>(`${base}/agents`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAgent: (agentId: string, input: UpdateAgentInput) =>
    request<Agent>(`${base}/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  getHarnessTemplate: (agentId: string) =>
    request<HarnessTemplate>(`${base}/agents/${agentId}/harness-template`),
  updateHarnessTemplate: (agentId: string, content: string) =>
    request<HarnessTemplate>(`${base}/agents/${agentId}/harness-template`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),

  listBuiltinHarnesses: () => request<BuiltinHarness[]>(`${base}/harnesses`),

  listTasks: (teamId: string) =>
    request<TaskWithRepositories[]>(`${base}/teams/${teamId}/tasks`),
  createTask: (input: CreateTaskInput) =>
    request<TaskWithRepositories>(`${base}/teams/${input.teamId}/tasks`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTaskStatus: (teamId: string, taskId: string, status: TaskStatus) =>
    request<TaskWithRepositories>(`${base}/teams/${teamId}/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  assignTaskAgent: (teamId: string, taskId: string, agentId: string | null) =>
    request<TaskWithRepositories>(`${base}/teams/${teamId}/tasks/${taskId}/agent`, {
      method: "PATCH",
      body: JSON.stringify({ agentId }),
    }),
  updateTask: (teamId: string, taskId: string, input: UpdateTaskInput) =>
    request<TaskWithRepositories>(`${base}/teams/${teamId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTask: (teamId: string, taskId: string) =>
    fetch(`${base}/teams/${teamId}/tasks/${taskId}`, { method: "DELETE" }),
  addTaskRepository: (teamId: string, taskId: string, repositoryId: string) =>
    fetch(`${base}/teams/${teamId}/tasks/${taskId}/repositories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryId }),
    }),
  removeTaskRepository: (teamId: string, taskId: string, repositoryId: string) =>
    fetch(`${base}/teams/${teamId}/tasks/${taskId}/repositories/${repositoryId}`, {
      method: "DELETE",
    }),
  runTask: (teamId: string, taskId: string) =>
    request<TaskRun>(`${base}/teams/${teamId}/tasks/${taskId}/run`, {
      method: "POST",
    }),
  listTaskRuns: (teamId: string, taskId: string) =>
    request<TaskRun[]>(`${base}/teams/${teamId}/tasks/${taskId}/runs`),
  getHeartbeatStatus: () => request<HeartbeatStatus>(`${base}/heartbeat/status`),

  getTeamSpend: (teamId: string) =>
    request<TeamSpend>(`${base}/teams/${teamId}/spend`),
  getTeamDailySpend: (teamId: string) =>
    request<DailySpend[]>(`${base}/teams/${teamId}/spend/daily`),
  updateTeamBudget: (teamId: string, input: UpdateTeamBudgetInput) =>
    request<Team>(`${base}/teams/${teamId}/budget`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  listRepositories: (projectId: string) =>
    request<Repository[]>(`${base}/projects/${projectId}/repositories`),
  createRepository: (input: CreateRepositoryInput) =>
    request<Repository>(`${base}/projects/${input.projectId}/repositories`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRepository: (projectId: string, repositoryId: string, input: UpdateRepositoryInput) =>
    request<Repository>(`${base}/projects/${projectId}/repositories/${repositoryId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  listTaskDependencies: (teamId: string, taskId: string) =>
    request<TaskDependency[]>(
      `${base}/teams/${teamId}/tasks/${taskId}/dependencies`,
    ),
  addTaskDependency: (
    teamId: string,
    taskId: string,
    input: CreateTaskDependencyInput,
  ) =>
    request<TaskDependency>(`${base}/teams/${teamId}/tasks/${taskId}/dependencies`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  removeTaskDependency: (teamId: string, taskId: string, dependencyId: string) =>
    fetch(`${base}/teams/${teamId}/tasks/${taskId}/dependencies/${dependencyId}`, {
      method: "DELETE",
    }),

  listTaskComments: (teamId: string, taskId: string) =>
    request<TaskComment[]>(`${base}/teams/${teamId}/tasks/${taskId}/comments`),
  addTaskComment: (teamId: string, taskId: string, input: CreateTaskCommentInput) =>
    request<TaskComment>(`${base}/teams/${teamId}/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTaskComment: (
    teamId: string,
    taskId: string,
    commentId: string,
    input: UpdateTaskCommentInput,
  ) =>
    request<TaskComment>(
      `${base}/teams/${teamId}/tasks/${taskId}/comments/${commentId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  replyAsAgent: (teamId: string, taskId: string, commentId: string, agentId: string) =>
    request<TaskComment>(
      `${base}/teams/${teamId}/tasks/${taskId}/comments/${commentId}/reply-as/${agentId}`,
      { method: "POST" },
    ),

  // Opened directly via EventSource (SSE), not through request<T> — no JSON
  // fetch involved here, just the URL.
  runEventsUrl: (teamId: string, taskId: string, runId: string) =>
    `${base}/teams/${teamId}/tasks/${taskId}/runs/${runId}/events`,
};
