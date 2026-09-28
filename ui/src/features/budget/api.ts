import type {
  DailySpend,
  ProjectSpend,
  Team,
  TeamSpend,
  UpdateTeamBudgetInput,
} from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

// Spend is read project-wide (it rolls up every team) and per team; the
// budget itself is only ever set on a team.
export const budgetApi = {
  getProjectSpend: (projectId: string) =>
    request<ProjectSpend>(`${apiBase}/projects/${projectId}/spend`),
  getTeamSpend: (teamId: string) =>
    request<TeamSpend>(`${apiBase}/teams/${teamId}/spend`),
  getTeamDailySpend: (teamId: string) =>
    request<DailySpend[]>(`${apiBase}/teams/${teamId}/spend/daily`),
  updateTeamBudget: (teamId: string, input: UpdateTeamBudgetInput) =>
    request<Team>(`${apiBase}/teams/${teamId}/budget`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
