import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { skillsApi } from "./api.js";
import { skillKeys } from "./keys.js";

export function useSkills() {
  return useQuery({ queryKey: skillKeys.all, queryFn: skillsApi.list });
}

// Only fetched once asked for: the body is the text of a SKILL.md, read when
// someone opens the skill, not for every row of the list.
export function useSkill(skillId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: skillKeys.detail(skillId!),
    queryFn: () => skillsApi.get(skillId!),
    enabled: !!skillId && enabled,
  });
}

export function useRegisterSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => skillsApi.register({ path }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

export function useScanSkills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: skillsApi.scan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

export function useUnregisterSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: skillsApi.unregister,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
      queryClient.invalidateQueries({ queryKey: skillKeys.allAgents });
    },
  });
}

export function useAgentSkills(agentId: string | undefined) {
  return useQuery({
    queryKey: skillKeys.forAgent(agentId!),
    queryFn: () => skillsApi.listForAgent(agentId!),
    enabled: !!agentId,
  });
}

// Replaces the Agent's whole set of skills. Used by the Agent form after the
// Agent itself has been saved.
export function useAssignSkills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      skillsApi.assign(agentId, { skillIds }),
    onSuccess: (_data, { agentId }) =>
      queryClient.invalidateQueries({ queryKey: skillKeys.forAgent(agentId) }),
  });
}
