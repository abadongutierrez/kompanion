import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, BuiltinHarness } from "@kompanion/shared";
import { agentsApi } from "./api.js";
import { agentKeys } from "./keys.js";

export function useTeamAgents(teamId: string) {
  return useQuery({
    queryKey: agentKeys.byTeam(teamId),
    queryFn: () => agentsApi.listAgents(teamId),
  });
}

export function useAgentLibrary() {
  return useQuery({
    queryKey: agentKeys.library,
    queryFn: agentsApi.listAllAgents,
  });
}

// There is no single-agent endpoint; the library list is the app's source
// of truth for an agent, same as TaskPage reads its task out of the task list.
export function useAgent(agentId: string | undefined) {
  const library = useAgentLibrary();
  return {
    ...library,
    data: agentId ? library.data?.find((a) => a.id === agentId) : undefined,
  };
}

export function useBuiltinHarnesses() {
  return useQuery({
    queryKey: agentKeys.builtinHarnesses,
    queryFn: agentsApi.listBuiltinHarnesses,
  });
}

export function useHarnessTemplate(agentId: string | undefined) {
  return useQuery({
    queryKey: agentKeys.harnessTemplate(agentId!),
    queryFn: () => agentsApi.getHarnessTemplate(agentId!),
    enabled: !!agentId,
  });
}

export function useAssignAgent(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => agentsApi.assignAgent(teamId, { agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.byTeam(teamId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.library });
    },
  });
}

export function useUnassignAgent(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => agentsApi.unassignAgent(teamId, agentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: agentKeys.byTeam(teamId) }),
  });
}

// "Seed from built-ins" reuses an existing agent in the library if one
// already points at that exact harnessPath (so seeding a second team
// doesn't duplicate agents the first team already created), otherwise
// creates it — then assigns either way.
export function useSeedAgentsFromBuiltins(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      harnesses,
      library,
    }: {
      harnesses: BuiltinHarness[];
      library: Agent[];
    }) => {
      for (const harness of harnesses) {
        const existing = library.find((a) => a.harnessPath === harness.path);
        const agent =
          existing ??
          (await agentsApi.createAgent({
            title: harness.title,
            harnessPath: harness.path,
          }));
        await agentsApi.assignAgent(teamId, { agentId: agent.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.byTeam(teamId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.library });
    },
  });
}

// Create writes the agent only; edit writes the agent and its harness
// template together, in parallel, the way the form always has.
export type AgentFormValues = {
  title: string;
  slug: string;
  harnessPath: string;
  runtime: Agent["runtime"];
  model: string;
};

export function useSaveAgent(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      values,
      harnessTemplate,
    }: {
      values: AgentFormValues;
      harnessTemplate: string;
    }): Promise<Agent> => {
      if (!agentId) {
        const { title, harnessPath, runtime, model } = values;
        return agentsApi.createAgent({ title, harnessPath, runtime, model });
      }
      const [saved] = await Promise.all([
        agentsApi.updateAgent(agentId, values),
        agentsApi.updateHarnessTemplate(agentId, harnessTemplate),
      ]);
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.library });
      // An edited agent can appear on any number of teams, so every team's
      // list is stale — allTeams is the prefix that covers all of them.
      queryClient.invalidateQueries({ queryKey: agentKeys.allTeams });
      if (agentId) {
        queryClient.invalidateQueries({
          queryKey: agentKeys.harnessTemplate(agentId),
        });
      }
    },
  });
}
