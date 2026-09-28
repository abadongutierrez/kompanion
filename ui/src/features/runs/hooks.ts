import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { budgetKeys } from "@/features/budget/keys.js";
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

// Starting a run touches four caches, three of which belong to other
// features: the run list, the task itself (a run moves its status through
// backlog -> in_progress -> in_review/blocked), and both spend figures.
export function useRunTask(teamId: string, taskId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runsApi.runTask(teamId, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runKeys.byTask(taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.byTeam(teamId) });
      queryClient.invalidateQueries({ queryKey: budgetKeys.teamSpend(teamId) });
      queryClient.invalidateQueries({
        queryKey: budgetKeys.projectSpend(projectId),
      });
    },
  });
}

// SSE, not a query: the transcript subscribes to this URL with an
// EventSource rather than fetching it.
export function runEventsUrl(teamId: string, taskId: string, runId: string) {
  return runsApi.runEventsUrl(teamId, taskId, runId);
}
