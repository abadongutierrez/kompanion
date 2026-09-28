import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { budgetApi } from "./api.js";
import { budgetKeys } from "./keys.js";

export function useProjectSpend(projectId: string) {
  return useQuery({
    queryKey: budgetKeys.projectSpend(projectId),
    queryFn: () => budgetApi.getProjectSpend(projectId),
  });
}

// `enabled` exists for the task card, which only cares about the budget for
// a task it could actually run.
export function useTeamSpend(teamId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: budgetKeys.teamSpend(teamId),
    queryFn: () => budgetApi.getTeamSpend(teamId),
    enabled,
  });
}

export function useUpdateTeamBudget(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (monthlyBudgetUsd: number | null) =>
      budgetApi.updateTeamBudget(teamId, { monthlyBudgetUsd }),
    // Only the cap moved; no money did, so the project total stands.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: budgetKeys.teamSpend(teamId) }),
  });
}
