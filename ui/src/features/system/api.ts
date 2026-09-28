import { apiBase, request } from "@/shared/api/request.js";

// Server-wide state that belongs to no project: the heartbeat scheduler that
// picks up runnable tasks on its own.
export type HeartbeatStatus = {
  enabled: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastRunTaskId: string | null;
  lastError: string | null;
};

export const systemApi = {
  getHeartbeatStatus: () => request<HeartbeatStatus>(`${apiBase}/heartbeat/status`),
};
