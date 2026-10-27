export const budgetKeys = {
  // Prefix of every projectSpend key, for callers that don't know the project.
  allProjectSpend: () => ["projectSpend"] as const,
  projectSpend: (projectId: string) => ["projectSpend", projectId] as const,
  teamSpend: (teamId: string) => ["teamSpend", teamId] as const,
  teamDailySpend: (teamId: string) => ["teamDailySpend", teamId] as const,
};
