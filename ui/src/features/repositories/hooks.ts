import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repositoriesApi } from "./api.js";
import { repositoryKeys } from "./keys.js";

export function useRepositories(projectId: string) {
  return useQuery({
    queryKey: repositoryKeys.byProject(projectId),
    queryFn: () => repositoriesApi.listRepositories(projectId),
  });
}

// The fields the panel's form collects. Create and update take the same
// three, so one mutation covers both and the presence of a repositoryId
// decides which endpoint runs.
export type RepositoryFormValues = {
  name: string;
  localPath: string;
  defaultBranch: string;
};

export function useSaveRepository(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repositoryId,
      values,
    }: {
      repositoryId: string | null;
      values: RepositoryFormValues;
    }) =>
      repositoryId
        ? repositoriesApi.updateRepository(projectId, repositoryId, values)
        : repositoriesApi.createRepository({ projectId, ...values }),
    // The hook owns the cache. Resetting the form is the caller's business,
    // so it passes its own onSuccess to mutate().
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: repositoryKeys.byProject(projectId),
      }),
  });
}
