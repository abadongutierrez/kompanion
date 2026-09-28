import type {
  Agent,
  AssignAgentInput,
  BuiltinHarness,
  CreateAgentInput,
  HarnessTemplate,
  UpdateAgentInput,
} from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const agentsApi = {
  // Agents assigned to a team (join over team_agents server-side).
  listAgents: (teamId: string) => request<Agent[]>(`${apiBase}/teams/${teamId}/agents`),
  assignAgent: (teamId: string, input: AssignAgentInput) =>
    request<Agent>(`${apiBase}/teams/${teamId}/agents`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  unassignAgent: (teamId: string, agentId: string) =>
    fetch(`${apiBase}/teams/${teamId}/agents/${agentId}`, { method: "DELETE" }),

  // The app-wide Agent library — create/edit/the shared CLAUDE.md template
  // all operate here, affecting every team the agent is assigned to,
  // regardless of which project that team belongs to.
  listAllAgents: () => request<Agent[]>(`${apiBase}/agents`),
  createAgent: (input: CreateAgentInput) =>
    request<Agent>(`${apiBase}/agents`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAgent: (agentId: string, input: UpdateAgentInput) =>
    request<Agent>(`${apiBase}/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  getHarnessTemplate: (agentId: string) =>
    request<HarnessTemplate>(`${apiBase}/agents/${agentId}/harness-template`),
  updateHarnessTemplate: (agentId: string, content: string) =>
    request<HarnessTemplate>(`${apiBase}/agents/${agentId}/harness-template`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),

  listBuiltinHarnesses: () => request<BuiltinHarness[]>(`${apiBase}/harnesses`),
};
