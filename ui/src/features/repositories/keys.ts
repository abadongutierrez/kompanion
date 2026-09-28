export const repositoryKeys = {
  byProject: (projectId: string) => ["repositories", projectId] as const,
};
