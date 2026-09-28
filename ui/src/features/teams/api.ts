import type { CreateTeamInput, Team } from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const teamsApi = {
  listTeams: (projectId: string) =>
    request<Team[]>(`${apiBase}/projects/${projectId}/teams`),
  createTeam: (input: CreateTeamInput) =>
    request<Team>(`${apiBase}/projects/${input.projectId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name: input.name }),
    }),
};
