import type { APIRequestContext } from "@playwright/test";

// The app has no project switcher and no delete endpoint for projects or
// teams (by design — matches the original Node server) — it always works
// against the *first* project/team it finds. So these helpers reuse
// whatever's already there instead of creating fresh ones per run, the same
// way a real user's already-set-up board would behave.

export type Seeded = {
  projectId: string;
  teamId: string;
};

async function json<T>(res: { ok(): boolean; json(): Promise<T>; status(): number; text(): Promise<string> }): Promise<T> {
  if (!res.ok()) {
    throw new Error(`request failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

export async function ensureProjectAndTeam(request: APIRequestContext): Promise<Seeded> {
  const projects = await json<{ id: string }[]>(await request.get("/api/projects"));
  const project =
    projects[0] ??
    (await json<{ id: string }>(
      await request.post("/api/projects", { data: { name: "E2E Project" } }),
    ));

  const teams = await json<{ id: string }[]>(
    await request.get(`/api/projects/${project.id}/teams`),
  );
  const team =
    teams[0] ??
    (await json<{ id: string }>(
      await request.post(`/api/projects/${project.id}/teams`, {
        data: { name: "E2E Team" },
      }),
    ));

  return { projectId: project.id, teamId: team.id };
}

// Seeds the team's agents from the server's built-in harnesses if it has
// none yet — direct port of AgentsPanel.tsx's "Seed from built-ins" button:
// find-or-create in the app-wide agent library (GET/POST /api/agents), then
// assign (POST /api/teams/:teamId/agents with { agentId }) — agents are
// fully independent of any project/team, only assignment is team-scoped.
export async function ensureAgents(request: APIRequestContext, teamId: string) {
  const agents = await json<{ id: string; title: string }[]>(
    await request.get(`/api/teams/${teamId}/agents`),
  );
  if (agents.length > 0) return agents;

  const harnesses = await json<{ title: string; path: string }[]>(
    await request.get("/api/harnesses"),
  );
  const allAgents = await json<{ id: string; harnessPath: string }[]>(
    await request.get("/api/agents"),
  );
  for (const harness of harnesses) {
    const existing = allAgents.find((r) => r.harnessPath === harness.path);
    const agent =
      existing ??
      (await json<{ id: string }>(
        await request.post("/api/agents", {
          data: { title: harness.title, harnessPath: harness.path },
        }),
      ));
    await request.post(`/api/teams/${teamId}/agents`, { data: { agentId: agent.id } });
  }
  return json<{ id: string; title: string }[]>(
    await request.get(`/api/teams/${teamId}/agents`),
  );
}

// Tasks *do* have a delete endpoint (unlike projects/teams/repositories) —
// tests that create their own scratch tasks should remove them afterward so
// repeated runs don't pile up on the real board.
export async function deleteTask(request: APIRequestContext, teamId: string, taskId: string) {
  await request.delete(`/api/teams/${teamId}/tasks/${taskId}`);
}
