import type { CreateProjectInput, Project } from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const projectsApi = {
  listProjects: () => request<Project[]>(`${apiBase}/projects`),
  createProject: (input: CreateProjectInput) =>
    request<Project>(`${apiBase}/projects`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
