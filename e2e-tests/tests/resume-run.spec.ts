import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam, deleteTask } from "./fixtures.js";

// Resuming a run. Real runs need an agent CLI and cost money, so the run list,
// the eligibility answer and the resume itself are stubbed in the browser; the
// eligibility rules, the command line and the cost are covered by the server's
// own tests. The last test talks to the real API for the refusals it can reach
// without a run.
test.describe("Resume a run", () => {
  let projectId: string;
  let teamId: string;
  let taskId: string | undefined;

  test.beforeAll(async ({ request }) => {
    ({ projectId, teamId } = await ensureProjectAndTeam(request));
  });

  test.afterEach(async ({ request }) => {
    if (taskId) await deleteTask(request, teamId, taskId);
    taskId = undefined;
  });

  async function createTask(request: import("@playwright/test").APIRequestContext) {
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, { data: { teamId, title: `E2E resume ${Date.now()}`, type: "story" } })
      .then((r) => r.json());
    taskId = task.id;
    return task.id;
  }

  const run = (over: { id: string } & Record<string, unknown>) => ({
    taskId, agentId: "dddddddd-0000-0000-0000-000000000000", agentTitle: "Engineer",
    runtime: "claude_code", model: null, status: "succeeded", summary: "done", rawOutput: null,
    costUsd: 0.01, durationMs: 1000, inputTokens: null, outputTokens: null, cacheReadTokens: null,
    cacheWriteTokens: null, instanceHash: "abcdef0123456789", gitSha: null, gitDirty: null,
    skills: [], sessionId: "sess-1", resumedFromRunId: null, createdAt: "2026-10-01T12:00:00.000Z",
    ...over,
  });

  test("a resumable run offers Resume, sends the follow-up, and the resumed run is listed", async ({ page, request }) => {
    const id = await createTask(request);
    const first = run({ id: "aaaaaaaa-1111-1111-1111-111111111111" });
    const resumed = run({
      id: "bbbbbbbb-2222-2222-2222-222222222222", createdAt: "2026-10-01T12:05:00.000Z",
      resumedFromRunId: first.id, summary: "pelican",
    });

    let runs: unknown[] = [first];
    let sentBody: unknown = null;
    await page.route(`**/api/teams/${teamId}/tasks/${id}/runs`, (route) => route.fulfill({ json: runs }));
    await page.route(`**/api/teams/${teamId}/tasks/${id}/runs/${first.id}/resume`, async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: { resumable: true, reason: null } });
      }
      sentBody = route.request().postDataJSON();
      runs = [resumed, first];
      return route.fulfill({ status: 201, json: resumed });
    });
    // Once the resumed run is the newest, it is the one asked about.
    await page.route(`**/api/teams/${teamId}/tasks/${id}/runs/${resumed.id}/resume`, (route) =>
      route.fulfill({ json: { resumable: true, reason: null } }),
    );

    await page.goto(`/projects/${projectId}/tasks/${id}`);

    await page.getByRole("button", { name: "↻ Resume" }).click();
    const send = page.getByRole("button", { name: "Send follow-up" });
    // Nothing to send yet.
    await expect(send).toBeDisabled();
    await page.getByLabel(/Follow-up/).fill("What was the secret word?");
    await send.click();

    await expect.poll(() => sentBody).toEqual({ message: "What was the secret word?" });
    await expect(page.getByText("↻ resumed")).toHaveCount(1);
    // Still only one Resume: the older run can't fork the conversation.
    await expect(page.getByRole("button", { name: "↻ Resume" })).toHaveCount(1);
  });

  test("a run that can't be resumed shows why, and no Resume action", async ({ page, request }) => {
    const id = await createTask(request);
    const piRun = run({ id: "cccccccc-3333-3333-3333-333333333333", runtime: "pi", sessionId: null });

    await page.route(`**/api/teams/${teamId}/tasks/${id}/runs`, (route) => route.fulfill({ json: [piRun] }));
    await page.route(`**/api/teams/${teamId}/tasks/${id}/runs/${piRun.id}/resume`, (route) =>
      route.fulfill({ json: { resumable: false, reason: "pi runs can't be resumed yet — start a fresh run instead" } }),
    );

    await page.goto(`/projects/${projectId}/tasks/${id}`);

    await expect(page.getByText("Can't resume: pi runs can't be resumed yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "↻ Resume" })).toHaveCount(0);
  });

  test("the API refuses a resume with no follow-up, and one of a run the task doesn't have", async ({ request }) => {
    const id = await createTask(request);
    const url = `/api/teams/${teamId}/tasks/${id}/runs/eeeeeeee-4444-4444-4444-444444444444/resume`;

    const empty = await request.post(url, { data: { message: "   " } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error).toContain("follow-up");

    const missing = await request.post(url, { data: { message: "go on" } });
    expect(missing.status()).toBe(404);

    const eligibility = await request.get(url);
    expect(eligibility.status()).toBe(404);
  });
});
