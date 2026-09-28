export const teamKeys = {
  byProject: (projectId: string) => ["teams", projectId] as const,
};
