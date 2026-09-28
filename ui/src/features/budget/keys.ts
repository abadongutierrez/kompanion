export const budgetKeys = {
  projectSpend: (projectId: string) => ["projectSpend", projectId] as const,
  teamSpend: (teamId: string) => ["teamSpend", teamId] as const,
  teamDailySpend: (teamId: string) => ["teamDailySpend", teamId] as const,
};
