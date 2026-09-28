import type {
  CreateTaskCommentInput,
  CreateTaskDependencyInput,
  CreateTaskInput,
  TaskComment,
  TaskDependency,
  TaskStatus,
  TaskWithRepositories,
  UpdateTaskCommentInput,
  UpdateTaskInput,
} from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const tasksApi = {
  listTasks: (teamId: string) =>
    request<TaskWithRepositories[]>(`${apiBase}/teams/${teamId}/tasks`),
  createTask: (input: CreateTaskInput) =>
    request<TaskWithRepositories>(`${apiBase}/teams/${input.teamId}/tasks`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTaskStatus: (teamId: string, taskId: string, status: TaskStatus) =>
    request<TaskWithRepositories>(`${apiBase}/teams/${teamId}/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  assignTaskAgent: (teamId: string, taskId: string, agentId: string | null) =>
    request<TaskWithRepositories>(`${apiBase}/teams/${teamId}/tasks/${taskId}/agent`, {
      method: "PATCH",
      body: JSON.stringify({ agentId }),
    }),
  updateTask: (teamId: string, taskId: string, input: UpdateTaskInput) =>
    request<TaskWithRepositories>(`${apiBase}/teams/${teamId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTask: (teamId: string, taskId: string) =>
    fetch(`${apiBase}/teams/${teamId}/tasks/${taskId}`, { method: "DELETE" }),

  // The repositories a task is linked to. Reads come back on the task itself
  // (TaskWithRepositories), so only the writes live here.
  addTaskRepository: (teamId: string, taskId: string, repositoryId: string) =>
    fetch(`${apiBase}/teams/${teamId}/tasks/${taskId}/repositories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryId }),
    }),
  removeTaskRepository: (teamId: string, taskId: string, repositoryId: string) =>
    fetch(`${apiBase}/teams/${teamId}/tasks/${taskId}/repositories/${repositoryId}`, {
      method: "DELETE",
    }),

  listTaskDependencies: (teamId: string, taskId: string) =>
    request<TaskDependency[]>(
      `${apiBase}/teams/${teamId}/tasks/${taskId}/dependencies`,
    ),
  addTaskDependency: (
    teamId: string,
    taskId: string,
    input: CreateTaskDependencyInput,
  ) =>
    request<TaskDependency>(`${apiBase}/teams/${teamId}/tasks/${taskId}/dependencies`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  removeTaskDependency: (teamId: string, taskId: string, dependencyId: string) =>
    fetch(`${apiBase}/teams/${teamId}/tasks/${taskId}/dependencies/${dependencyId}`, {
      method: "DELETE",
    }),

  listTaskComments: (teamId: string, taskId: string) =>
    request<TaskComment[]>(`${apiBase}/teams/${teamId}/tasks/${taskId}/comments`),
  addTaskComment: (teamId: string, taskId: string, input: CreateTaskCommentInput) =>
    request<TaskComment>(`${apiBase}/teams/${teamId}/tasks/${taskId}/comments`, {
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
      `${apiBase}/teams/${teamId}/tasks/${taskId}/comments/${commentId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  replyAsAgent: (teamId: string, taskId: string, commentId: string, agentId: string) =>
    request<TaskComment>(
      `${apiBase}/teams/${teamId}/tasks/${taskId}/comments/${commentId}/reply-as/${agentId}`,
      { method: "POST" },
    ),
};
