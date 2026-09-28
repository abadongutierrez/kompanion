import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProjectInput } from "@kompanion/shared";
import { projectsApi } from "./api.js";
import { projectKeys } from "./keys.js";

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: projectsApi.listProjects,
  });
}

// One project by id, read out of the same cached list rather than a second
// request — the list is already loaded on every screen that needs this, and
// there is no by-id endpoint.
export function useProject(projectId: string | undefined) {
  const projects = useProjects();
  return {
    ...projects,
    data: projectId ? projects.data?.find((p) => p.id === projectId) : undefined,
  };
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectsApi.createProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
