// Two different lists share the word "agents", and the keys keep them apart:
// `byTeam` is the assignment list for one team, `library` is the app-wide
// Agent library. `allTeams` is the prefix that invalidates every team's list
// at once — used after editing an agent, which can change it on every team
// it is assigned to.
export const agentKeys = {
  allTeams: ["agents"] as const,
  byTeam: (teamId: string) => ["agents", teamId] as const,
  library: ["allAgents"] as const,
  harnessTemplate: (agentId: string) => ["harnessTemplate", agentId] as const,
  builtinHarnesses: ["builtinHarnesses"] as const,
};
