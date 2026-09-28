export const runKeys = {
  byTask: (taskId: string) => ["taskRuns", taskId] as const,
};
