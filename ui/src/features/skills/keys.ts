// `all` is the prefix for everything about the library itself (the list and
// each skill's detail), so one invalidation after a register, scan or
// unregister refreshes all of it. An Agent's skills have their own key: they
// change when an Agent is saved, and when a skill is unregistered.
export const skillKeys = {
  all: ["skills"] as const,
  detail: (skillId: string) => ["skills", skillId] as const,
  forAgent: (agentId: string) => ["agentSkills", agentId] as const,
  allAgents: ["agentSkills"] as const,
};
