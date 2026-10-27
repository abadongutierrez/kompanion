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
      queryClient.invalidateQueries({ queryKey: taskKeys.byTeam(teamId) });
      queryClient.invalidateQueries({ queryKey: budgetKeys.teamSpend(teamId) });
      queryClient.invalidateQueries({
        queryKey: budgetKeys.projectSpend(projectId),
      });
      queryClient.invalidateQueries({ queryKey: systemKeys.claudeUsage });
    },
  });
}

// Asked only for the newest finished run: the server builds the Agent's
// current instance to answer, so it is not free.
export function useResumeEligibility(
  teamId: string,
  taskId: string,
  runId: string,
  { enabled }: { enabled: boolean },
) {
  return useQuery({
    queryKey: runKeys.resumeEligibility(runId),
    queryFn: () => runsApi.resumeEligibility(teamId, taskId, runId),
    enabled,
  });
}

// The POST only returns when the resumed run ends, so the caches that show it
// running are refreshed shortly after it starts rather than on success alone:
// the task's runningSince is what turns on the run list's polling.
export function useResumeRun(teamId: string, taskId: string, runId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: runKeys.byTask(taskId) });
    queryClient.invalidateQueries({ queryKey: taskKeys.byTeam(teamId) });
    queryClient.invalidateQueries({ queryKey: runKeys.resumeEligibility(runId) });
  };
  return useMutation({
    mutationFn: (message: string) => runsApi.resumeRun(teamId, taskId, runId, message),
    onMutate: () => {
      setTimeout(refresh, 1000);
    },
    onSettled: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: budgetKeys.teamSpend(teamId) });
      // The run row doesn't know its project, so every project's spend is
      // refreshed; only the one on screen actually refetches.
      queryClient.invalidateQueries({ queryKey: budgetKeys.allProjectSpend() });
    },
  });
}

// SSE, not a query: the transcript subscribes to this URL with an
// EventSource rather than fetching it.
export function runEventsUrl(teamId: string, taskId: string, runId: string) {
  return runsApi.runEventsUrl(teamId, taskId, runId);
}
