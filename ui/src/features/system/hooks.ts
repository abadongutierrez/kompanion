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
