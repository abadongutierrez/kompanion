import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam, ensureRoles } from "./fixtures.js";

// Roles have no delete endpoint (same as Projects/Teams/Repositories) —
// a role created via POST /api/roles permanently joins the app-wide
// library, mirroring what a real operator using the UI would get too.
// These tests are written to avoid *needing* new throwaway roles/teams
// where the underlying mechanic can be proven idempotently instead
// (assign/unassign restores original state; only the one deliberately
// "create a new role" test leaves a role behind, same as a real user would).

test.describe("roles: app-wide library, team-assigned", () => {
  let teamId: string;

  test.beforeAll(async ({ request }) => {
    const seeded = await ensureProjectAndTeam(request);
    teamId = seeded.teamId;
    await ensureRoles(request, teamId);
  });

  test("unassigning a role removes it from the team but not from the app-wide library", async ({ request }) => {
    const teamRoles: { id: string; title: string }[] = await request
      .get(`/api/teams/${teamId}/roles`)
      .then((r) => r.json());
    expect(teamRoles.length).toBeGreaterThan(0);
    const role = teamRoles[0];

    const unassignRes = await request.delete(`/api/teams/${teamId}/roles/${role.id}`);
    expect(unassignRes.status()).toBe(204);

    const afterUnassign: { id: string }[] = await request
      .get(`/api/teams/${teamId}/roles`)
      .then((r) => r.json());
    expect(afterUnassign.find((r) => r.id === role.id)).toBeUndefined();

    // The role itself must still exist in the app-wide library — this is
    // the entire point of the library/team-assignment split.
    const allRoles: { id: string }[] = await request.get("/api/roles").then((r) => r.json());
    expect(allRoles.find((r) => r.id === role.id)).toBeDefined();

    // Restore original state so the test is idempotent across runs.
    const reassignRes = await request.post(`/api/teams/${teamId}/roles`, {
      data: { roleId: role.id },
    });
    expect(reassignRes.status()).toBe(201);
    const restored: { id: string }[] = await request
      .get(`/api/teams/${teamId}/roles`)
      .then((r) => r.json());
    expect(restored.find((r) => r.id === role.id)).toBeDefined();
  });

  test("assigning a role already assigned to the team is a harmless no-op", async ({ request }) => {
    const teamRoles: { id: string }[] = await request
      .get(`/api/teams/${teamId}/roles`)
      .then((r) => r.json());
    const role = teamRoles[0];

    const res = await request.post(`/api/teams/${teamId}/roles`, {
      data: { roleId: role.id },
    });
    expect(res.status()).toBe(201);

    const after: { id: string }[] = await request
      .get(`/api/teams/${teamId}/roles`)
      .then((r) => r.json());
    expect(after.filter((r) => r.id === role.id)).toHaveLength(1);
  });

  test("the team-scoped endpoint no longer accepts create-in-place (assign-only)", async ({ request }) => {
    const res = await request.post(`/api/teams/${teamId}/roles`, {
      data: { title: "Should be rejected", harnessPath: "/tmp" },
    });
    expect(res.status()).toBe(400);
  });

  test("creating a role in the library, editing its fields, and editing its CLAUDE.md template", async ({ request }) => {
    const existingRoles: { harnessPath: string }[] = await request
      .get("/api/roles")
      .then((r) => r.json());
    const harnessPath = existingRoles[0].harnessPath;

    const created = await request
      .post("/api/roles", { data: { title: `E2E Role ${Date.now()}`, harnessPath } })
      .then((r) => r.json());

    // Edit title + slug.
    const newSlug = `e2e-role-${Date.now()}`;
    const updated = await request
      .patch(`/api/roles/${created.id}`, { data: { title: "E2E Role (renamed)", slug: newSlug } })
      .then((r) => r.json());
    expect(updated.title).toBe("E2E Role (renamed)");
    expect(updated.slug).toBe(newSlug);

    // harnessPath is a real, shared directory (reused from an existing
    // role, deliberately, rather than requiring a throwaway one on disk) —
    // capture its current CLAUDE.md content first and restore it
    // afterward no matter what, since writing here is the same file every
    // other role/team pointed at this path actually reads.
    const before: { content: string } = await request
      .get(`/api/roles/${created.id}/harness-template`)
      .then((r) => r.json());
    try {
      const content = `# E2E test content ${Date.now()}`;
      const writeRes = await request.patch(`/api/roles/${created.id}/harness-template`, {
        data: { content },
      });
      expect(writeRes.status()).toBe(200);
      const readBack = await request
        .get(`/api/roles/${created.id}/harness-template`)
        .then((r) => r.json());
      expect(readBack.content).toBe(content);
    } finally {
      await request.patch(`/api/roles/${created.id}/harness-template`, {
        data: { content: before.content },
      });
    }
  });

  test("rejects an unknown roleId on assign", async ({ request }) => {
    const res = await request.post(`/api/teams/${teamId}/roles`, {
      data: { roleId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(404);
  });

  test("rejects a duplicate slug on edit", async ({ request }) => {
    const allRoles: { harnessPath: string; slug: string }[] = await request
      .get("/api/roles")
      .then((r) => r.json());
    const existingSlug = allRoles[0].slug;
    const harnessPath = allRoles[0].harnessPath; // a real, already-valid harness dir

    const created = await request
      .post("/api/roles", { data: { title: `E2E Slug Test ${Date.now()}`, harnessPath } })
      .then((r) => r.json());

    const res = await request.patch(`/api/roles/${created.id}`, { data: { slug: existingSlug } });
    expect(res.status()).toBe(409);
  });
});
