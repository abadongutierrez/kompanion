import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam } from "./fixtures.js";

// Regression coverage for gaps found while auditing the Node -> Kotlin
// server port: each of these passed silently (wrong status code, or a bad
// row actually persisted) before being fixed, and none of them are caught
// by the browser-driven board.spec.ts because the UI already prevents
// triggering them client-side (e.g. the comment box is disabled on an
// empty/whitespace body). Testing directly against the API is what
// actually exercises the server's own validation.

// /health lives outside the /api prefix, so ui/vite.config.ts's proxy
// (which only forwards /api/*) never forwards it — it has to be checked
// against the backend directly rather than through the app's own baseURL.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3200";

test("GET /health reports ok", async () => {
  const res = await fetch(`${BACKEND_URL}/health`);
  expect(res.ok).toBeTruthy();
  expect(await res.json()).toEqual({ ok: true });
});

test.describe("validation the client-side UI can't be relied on to enforce", () => {
  let teamId: string;

  test.beforeAll(async ({ request }) => {
    ({ teamId } = await ensureProjectAndTeam(request));
  });

  test("rejects a negative monthly budget and never persists it", async ({ request }) => {
    const res = await request.patch(`/api/teams/${teamId}/budget`, {
      data: { monthlyBudgetUsd: -5 },
    });
    expect(res.status()).toBe(400);

    const spend = await request.get(`/api/teams/${teamId}/spend`).then((r) => r.json());
    expect(spend.monthlyBudgetUsd).not.toBe(-5);
  });

  test("rejects an empty task comment body", async ({ request }) => {
    const tasks: { id: string }[] = await request
      .get(`/api/teams/${teamId}/tasks`)
      .then((r) => r.json());
    test.skip(tasks.length === 0, "no task available to comment on");

    const res = await request.post(`/api/teams/${teamId}/tasks/${tasks[0].id}/comments`, {
      data: { body: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects an invalid task status transition", async ({ request }) => {
    const created = await request
      .post(`/api/teams/${teamId}/tasks`, {
        data: { teamId, title: `regression ${Date.now()}`, type: "chore" },
      })
      .then((r) => r.json());

    // backlog -> done is not a legal transition (TASK_STATUS_TRANSITIONS.backlog is only ["in_progress"]).
    const res = await request.patch(`/api/teams/${teamId}/tasks/${created.id}/status`, {
      data: { status: "done" },
    });
    expect(res.status()).toBe(409);

    await request.delete(`/api/teams/${teamId}/tasks/${created.id}`);
  });

  test("rejects a task depending on itself", async ({ request }) => {
    const created = await request
      .post(`/api/teams/${teamId}/tasks`, {
        data: { teamId, title: `regression ${Date.now()}`, type: "chore" },
      })
      .then((r) => r.json());

    const res = await request.post(`/api/teams/${teamId}/tasks/${created.id}/dependencies`, {
      data: { relatedTaskId: created.id, type: "blocked_by" },
    });
    expect(res.status()).toBe(400);

    await request.delete(`/api/teams/${teamId}/tasks/${created.id}`);
  });
});
