import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { budgetKeys } from "@/features/budget/keys.js";
import { systemKeys } from "@/features/system/keys.js";
import { taskKeys } from "@/features/tasks/keys.js";
import { runsApi } from "./api.js";
import { runKeys } from "./keys.js";

// Polled while the task is running, idle otherwise. The caller knows whether
// its task is running; the hook does not go looking for that itself.
export function useTaskRuns(
  teamId: string | null,
  taskId: string | undefined,
  { isRunning, enabled = true }: { isRunning: boolean; enabled?: boolean },
) {
  return useQuery({
    queryKey: runKeys.byTask(taskId!),
    queryFn: () => runsApi.listTaskRuns(teamId!, taskId!),
    enabled: enabled && !!teamId && !!taskId,
    refetchInterval: isRunning ? 3000 : false,
  });
}

// The Runs tab. Always polled: runs start and end from other tabs, other
// browsers and the heartbeat, and nothing here would hear about it otherwise.
export function useActiveRuns(projectId: string) {
  return useQuery({
    queryKey: runKeys.activeByProject(projectId),
    queryFn: () => runsApi.listActiveRuns(projectId),
    refetchInterval: 3000,
  });
}

// Starting a run touches five caches, four of which belong to other
// features: the run list, the task itself (a run moves its status through
// backlog -> in_progress -> in_review/blocked), both spend figures, and the
// sidebar's Claude usage readout. The POST returns once the run is over, so
// this is also "a run just finished".
export function useRunTask(teamId: string, taskId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runsApi.runTask(teamId, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runKeys.byTask(taskId) });
      queryClient.invalidateQueries({
        queryKey: runKeys.activeByProject(projectId),
      });
      queryClient.invalidateQueries({ queryKey: taskKeys.byTeam(teamId) });
      queryClient.invalidateQueries({ queryKey: budgetKeys.teamSpend(teamId) });
      queryClient.invalidateQueries({
        queryKey: budgetKeys.projectSpend(projectId),
      });
      queryClient.invalidateQueries({ queryKey: systemKeys.claudeUsage });
    },
  });
}

// SSE, not a query: the transcript subscribes to this URL with an
// EventSource rather than fetching it.
export function runEventsUrl(teamId: string, taskId: string, runId: string) {
  return runsApi.runEventsUrl(teamId, taskId, runId);
}
