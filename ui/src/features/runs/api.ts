import type { ResumeEligibility, TaskRun } from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

const runUrl = (teamId: string, taskId: string, runId: string) =>
  `${apiBase}/teams/${teamId}/tasks/${taskId}/runs/${runId}`;

export const runsApi = {
  resumeEligibility: (teamId: string, taskId: string, runId: string) =>
    request<ResumeEligibility>(`${runUrl(teamId, taskId, runId)}/resume`),
  // Like runTask, this only answers once the resumed run has finished.
  resumeRun: (teamId: string, taskId: string, runId: string, message: string) =>
    request<TaskRun>(`${runUrl(teamId, taskId, runId)}/resume`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

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
