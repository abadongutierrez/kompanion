export const taskKeys = {
  byTeam: (teamId: string) => ["tasks", teamId] as const,
  comments: (taskId: string) => ["taskComments", taskId] as const,
  diff: (taskId: string) => ["taskDiff", taskId] as const,
  dependencies: (taskId: string) => ["taskDependencies", taskId] as const,
};
