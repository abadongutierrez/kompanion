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

// Seeds the team's roles from the server's built-in harnesses if it has
// none yet — direct port of RolesPanel.tsx's "Seed from built-ins" button
// (a client-side loop over createRole, not a single backend endpoint).
export async function ensureRoles(request: APIRequestContext, teamId: string) {
  const roles = await json<{ id: string; title: string }[]>(
    await request.get(`/api/teams/${teamId}/roles`),
  );
  if (roles.length > 0) return roles;

  const harnesses = await json<{ title: string; path: string }[]>(
    await request.get("/api/harnesses"),
  );
  for (const harness of harnesses) {
    await request.post(`/api/teams/${teamId}/roles`, {
      data: { title: harness.title, harnessPath: harness.path },
    });
  }
  return json<{ id: string; title: string }[]>(
    await request.get(`/api/teams/${teamId}/roles`),
  );
}

// Tasks *do* have a delete endpoint (unlike projects/teams/repositories) —
// tests that create their own scratch tasks should remove them afterward so
// repeated runs don't pile up on the real board.
export async function deleteTask(request: APIRequestContext, teamId: string, taskId: string) {
  await request.delete(`/api/teams/${teamId}/tasks/${taskId}`);
}
