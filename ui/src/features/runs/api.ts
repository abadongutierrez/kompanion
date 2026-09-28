import type { TaskRun } from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const runsApi = {
  runTask: (teamId: string, taskId: string) =>
    request<TaskRun>(`${apiBase}/teams/${teamId}/tasks/${taskId}/run`, {
      method: "POST",
    }),
  listTaskRuns: (teamId: string, taskId: string) =>
    request<TaskRun[]>(`${apiBase}/teams/${teamId}/tasks/${taskId}/runs`),

  // Opened directly via EventSource (SSE), not through request<T> — no JSON
  // fetch involved here, just the URL.
  runEventsUrl: (teamId: string, taskId: string, runId: string) =>
    `${apiBase}/teams/${teamId}/tasks/${taskId}/runs/${runId}/events`,
};
