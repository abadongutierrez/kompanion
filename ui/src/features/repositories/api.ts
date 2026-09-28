import type {
  CreateRepositoryInput,
  Repository,
  UpdateRepositoryInput,
} from "@kompanion/shared";
import { apiBase, request } from "@/shared/api/request.js";

export const repositoriesApi = {
  listRepositories: (projectId: string) =>
    request<Repository[]>(`${apiBase}/projects/${projectId}/repositories`),
  createRepository: (input: CreateRepositoryInput) =>
    request<Repository>(`${apiBase}/projects/${input.projectId}/repositories`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRepository: (
    projectId: string,
    repositoryId: string,
    input: UpdateRepositoryInput,
  ) =>
    request<Repository>(
      `${apiBase}/projects/${projectId}/repositories/${repositoryId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
};
