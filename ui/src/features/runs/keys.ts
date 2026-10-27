export const runKeys = {
  byTask: (taskId: string) => ["taskRuns", taskId] as const,
  resumeEligibility: (runId: string) => ["runResumeEligibility", runId] as const,
};
