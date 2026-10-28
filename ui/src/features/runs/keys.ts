export const runKeys = {
  byTask: (taskId: string) => ["taskRuns", taskId] as const,
  activeByProject: (projectId: string) => ["activeRuns", projectId] as const,
};
