import { useQuery } from "@tanstack/react-query";
import { systemApi } from "./api.js";
import { systemKeys } from "./keys.js";

// Polled, not pushed: the heartbeat scheduler ticks server-side and the
// header just samples it.
export function useHeartbeatStatus() {
  return useQuery({
    queryKey: systemKeys.heartbeatStatus,
    queryFn: systemApi.getHeartbeatStatus,
    refetchInterval: 10_000,
  });
}

// Polled once a minute; the server caches for the same minute, so open tabs
// don't multiply calls to the usage endpoint. A finished run also
// invalidates this (see useRunTask).
export function useClaudeUsage() {
  return useQuery({
    queryKey: systemKeys.claudeUsage,
    queryFn: systemApi.getClaudeUsage,
    refetchInterval: 60_000,
  });
}
