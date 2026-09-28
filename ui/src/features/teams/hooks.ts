import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTeamInput } from "@kompanion/shared";
import { teamsApi } from "./api.js";
import { teamKeys } from "./keys.js";

export function useTeams(projectId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.byProject(projectId!),
    queryFn: () => teamsApi.listTeams(projectId!),
    enabled: !!projectId,
  });
}

// Team selection is still "the first one". A switcher is a separate,
// not-yet-built concern; this is the one place that assumption lives, so
// there is exactly one thing to change when it arrives.
export function useCurrentTeamId(projectId: string | undefined) {
  const teams = useTeams(projectId);
  return { ...teams, teamId: teams.data?.[0]?.id ?? null };
}

export function useCreateTeam(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateTeamInput, "projectId">) =>
      teamsApi.createTeam({ ...input, projectId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: teamKeys.byProject(projectId) }),
  });
}
