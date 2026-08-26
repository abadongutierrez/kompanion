import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam, ensureAgents } from "./fixtures.js";

// Agents have no delete endpoint (same as Projects/Teams/Repositories) —
// an agent created via POST /api/agents permanently joins the app-wide
// library, mirroring what a real operator using the UI would get too.
// These tests are written to avoid *needing* new throwaway agents/teams
// where the underlying mechanic can be proven idempotently instead
// (assign/unassign restores original state; only the one deliberately
// "create a new agent" test leaves an agent behind, same as a real user would).

test.describe("agents: app-wide library, team-assigned", () => {
  let teamId: string;

  test.beforeAll(async ({ request }) => {
    const seeded = await ensureProjectAndTeam(request);
    teamId = seeded.teamId;
    await ensureAgents(request, teamId);
  });

  test("unassigning an agent removes it from the team but not from the app-wide library", async ({ request }) => {
    const teamAgents: { id: string; title: string }[] = await request
      .get(`/api/teams/${teamId}/agents`)
      .then((r) => r.json());
    expect(teamAgents.length).toBeGreaterThan(0);
    const agent = teamAgents[0];

    const unassignRes = await request.delete(`/api/teams/${teamId}/agents/${agent.id}`);
    expect(unassignRes.status()).toBe(204);

    const afterUnassign: { id: string }[] = await request
      .get(`/api/teams/${teamId}/agents`)
      .then((r) => r.json());
    expect(afterUnassign.find((r) => r.id === agent.id)).toBeUndefined();

    // The agent itself must still exist in the app-wide library — this is
    // the entire point of the library/team-assignment split.
    const allAgents: { id: string }[] = await request.get("/api/agents").then((r) => r.json());
    expect(allAgents.find((r) => r.id === agent.id)).toBeDefined();

    // Restore original state so the test is idempotent across runs.
    const reassignRes = await request.post(`/api/teams/${teamId}/agents`, {
      data: { agentId: agent.id },
    });
    expect(reassignRes.status()).toBe(201);
    const restored: { id: string }[] = await request
      .get(`/api/teams/${teamId}/agents`)
      .then((r) => r.json());
    expect(restored.find((r) => r.id === agent.id)).toBeDefined();
  });

  test("assigning an agent already assigned to the team is a harmless no-op", async ({ request }) => {
    const teamAgents: { id: string }[] = await request
      .get(`/api/teams/${teamId}/agents`)
      .then((r) => r.json());
    const agent = teamAgents[0];

    const res = await request.post(`/api/teams/${teamId}/agents`, {
      data: { agentId: agent.id },
    });
    expect(res.status()).toBe(201);

    const after: { id: string }[] = await request
      .get(`/api/teams/${teamId}/agents`)
      .then((r) => r.json());
    expect(after.filter((r) => r.id === agent.id)).toHaveLength(1);
  });

  test("the team-scoped endpoint no longer accepts create-in-place (assign-only)", async ({ request }) => {
    const res = await request.post(`/api/teams/${teamId}/agents`, {
      data: { title: "Should be rejected", harnessPath: "/tmp" },
    });
    expect(res.status()).toBe(400);
  });

  test("creating an agent in the library, editing its fields, and editing its CLAUDE.md template", async ({ request }) => {
    const existingAgents: { harnessPath: string }[] = await request
      .get("/api/agents")
      .then((r) => r.json());
    const harnessPath = existingAgents[0].harnessPath;

    const created = await request
      .post("/api/agents", { data: { title: `E2E Agent ${Date.now()}`, harnessPath } })
      .then((r) => r.json());

    // Edit title + slug.
    const newSlug = `e2e-agent-${Date.now()}`;
    const updated = await request
      .patch(`/api/agents/${created.id}`, { data: { title: "E2E Agent (renamed)", slug: newSlug } })
      .then((r) => r.json());
    expect(updated.title).toBe("E2E Agent (renamed)");
    expect(updated.slug).toBe(newSlug);

    // harnessPath is a real, shared directory (reused from an existing
    // agent, deliberately, rather than requiring a throwaway one on disk) —
    // capture its current CLAUDE.md content first and restore it
    // afterward no matter what, since writing here is the same file every
    // other agent/team pointed at this path actually reads.
    const before: { content: string } = await request
      .get(`/api/agents/${created.id}/harness-template`)
      .then((r) => r.json());
    try {
      const content = `# E2E test content ${Date.now()}`;
      const writeRes = await request.patch(`/api/agents/${created.id}/harness-template`, {
        data: { content },
      });
      expect(writeRes.status()).toBe(200);
      const readBack = await request
        .get(`/api/agents/${created.id}/harness-template`)
        .then((r) => r.json());
      expect(readBack.content).toBe(content);
    } finally {
      await request.patch(`/api/agents/${created.id}/harness-template`, {
        data: { content: before.content },
      });
    }
  });

  test("rejects an unknown agentId on assign", async ({ request }) => {
    const res = await request.post(`/api/teams/${teamId}/agents`, {
      data: { agentId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(404);
  });

  test("rejects a duplicate slug on edit", async ({ request }) => {
    const allAgents: { harnessPath: string; slug: string }[] = await request
      .get("/api/agents")
      .then((r) => r.json());
    const existingSlug = allAgents[0].slug;
    const harnessPath = allAgents[0].harnessPath; // a real, already-valid harness dir

    const created = await request
      .post("/api/agents", { data: { title: `E2E Slug Test ${Date.now()}`, harnessPath } })
      .then((r) => r.json());

    const res = await request.patch(`/api/agents/${created.id}`, { data: { slug: existingSlug } });
    expect(res.status()).toBe(409);
  });
});
