import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ensureProjectAndTeam, deleteTask } from "./fixtures.js";

// The task page's right sidebar: "Spent so far" sums every run's cost.
// Runs are stubbed — real ones need the Claude CLI and cost money.
test.describe("task page sidebar", () => {
  let projectId: string;
  let teamId: string;
  let createdTaskId: string | undefined;

  test.beforeAll(async ({ request }) => {
    const seeded = await ensureProjectAndTeam(request);
    projectId = seeded.projectId;
    teamId = seeded.teamId;
  });

  test.afterEach(async ({ request }) => {
    if (createdTaskId) {
      await deleteTask(request, teamId, createdTaskId);
      createdTaskId = undefined;
    }
  });

  async function makeTask(request: APIRequestContext, title: string) {
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, { data: { teamId, title, type: "story" } })
      .then((r) => r.json());
    createdTaskId = task.id;
    return task.id;
  }

  const run = (
    id: string,
    taskId: string,
    costUsd: number | null,
    extra: { status?: string; agentTitle?: string; durationMs?: number | null } = {},
  ) => ({
    id, taskId, agentId: null, agentTitle: "Engineer", status: "succeeded",
    createdAt: "2026-08-26T12:00:00.000Z", durationMs: 1000, costUsd, ...extra,
  });

  async function stubRuns(page: Page, taskId: string, runs: unknown[]) {
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({ json: runs }),
    );
    await page.route("**/runs/*/events", (route) =>
      route.fulfill({ contentType: "text/event-stream", body: "event: done\ndata: {}\n\n" }),
    );
  }

  test("sums every run's cost, treating an unfinished run as 0", async ({ page, request }) => {
    const title = `E2E sidebar sum ${Date.now()}`;
    const taskId = await makeTask(request, title);
    await stubRuns(page, taskId, [
      run("aaaaaaaa-1111-1111-1111-111111111111", taskId, 0.5),
      run("bbbbbbbb-2222-2222-2222-222222222222", taskId, null),
      run("cccccccc-3333-3333-3333-333333333333", taskId, 0.25),
    ]);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await expect(sidebar.getByText("Spent so far")).toBeVisible();
    await expect(sidebar.getByTestId("task-spent")).toHaveText("$0.7500");
    await expect(sidebar.getByText("across 3 runs")).toBeVisible();

    // It sits to the right of the main column.
    const heading = await page.getByRole("heading", { name: title }).boundingBox();
    const aside = await sidebar.boundingBox();
    expect(aside!.x).toBeGreaterThan(heading!.x + heading!.width);
  });

  test("singular wording for one run", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar one ${Date.now()}`);
    await stubRuns(page, taskId, [run("dddddddd-4444-4444-4444-444444444444", taskId, 1.23456)]);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await expect(sidebar.getByTestId("task-spent")).toHaveText("$1.2346");
    await expect(sidebar.getByText("across 1 run", { exact: true })).toBeVisible();
  });

  test("a task never run shows $0 and says so", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar none ${Date.now()}`);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await expect(sidebar.getByTestId("task-spent")).toHaveText("$0.0000");
    await expect(sidebar.getByText("Not run yet")).toBeVisible();
  });

  test("leaves out runs still in progress", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar running ${Date.now()}`);
    await stubRuns(page, taskId, [
      run("eeeeeeee-5555-5555-5555-555555555555", taskId, 0.4),
      // A running run that somehow already carries a cost must still not count.
      run("ffffffff-6666-6666-6666-666666666666", taskId, 9, { status: "running", durationMs: null }),
    ]);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await expect(sidebar.getByTestId("task-spent")).toHaveText("$0.4000");
    await expect(sidebar.getByText("across 1 run", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("1 running, not counted")).toBeVisible();
  });

  async function stubTwoAgents(page: Page, taskId: string) {
    await stubRuns(page, taskId, [
      run("11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", taskId, 0.75, { agentTitle: "Engineer", durationMs: 200_000 }),
      run("22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb", taskId, 0.25, { agentTitle: "QA", durationMs: 42_000 }),
    ]);
  }

  test("splits spend by agent with time, percentage and a bar", async ({ page, request }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const taskId = await makeTask(request, `E2E sidebar agents ${Date.now()}`);
    await stubTwoAgents(page, taskId);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const rows = page
      .getByRole("complementary", { name: "Task details" })
      .getByTestId("task-spent-agent");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Engineer");
    await expect(rows.nth(0)).toContainText("$0.7500");
    await expect(rows.nth(0)).toContainText("3m 20s");
    await expect(rows.nth(0)).toContainText("75%");
    await expect(rows.nth(0).getByRole("progressbar")).toBeVisible();
    await expect(rows.nth(1)).toContainText("QA");
    await expect(rows.nth(1)).toContainText("42s");
    await expect(rows.nth(1)).toContainText("25%");
  });

  test("on a small screen shows only time and percentage, no bars", async ({ page, request }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    const taskId = await makeTask(request, `E2E sidebar small ${Date.now()}`);
    await stubTwoAgents(page, taskId);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const row = page
      .getByRole("complementary", { name: "Task details" })
      .getByTestId("task-spent-agent")
      .first();
    await expect(row.getByText("3m 20s")).toBeVisible();
    await expect(row.getByText("75%")).toBeVisible();
    await expect(row.getByText("$0.7500")).toBeHidden();
    await expect(row.getByRole("progressbar", { includeHidden: true })).toBeHidden();
  });

  test("no sidebar when the task does not exist", async ({ page }) => {
    await page.goto(`/projects/${projectId}/tasks/00000000-0000-0000-0000-000000000000`);
    // Not "Task not found": on main an unknown id currently sits on Loading…
    // (task-page.spec.ts's not-found test fails there too). Either way, no task
    // means no sidebar.
    await expect(page.getByRole("link", { name: "← Board" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Task details" })).toHaveCount(0);
  });

  // Documents current behavior: a failed runs fetch is indistinguishable
  // from a task that has never run. See verdict.md in the task workspace.
  test("runs fetch failure currently reads as 'Not run yet'", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar err ${Date.now()}`);
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({ status: 500, json: { error: "boom" } }),
    );

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await expect(sidebar.getByTestId("task-spent")).toHaveText("$0.0000");
    await expect(sidebar.getByText("Not run yet")).toBeVisible();
  });
  // QA edge cases for the per-agent breakdown (commit 5be6202).
  test("only running runs: total $0, 'Not run yet', no agent rows", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar only running ${Date.now()}`);
    await stubRuns(page, taskId, [
      run("12121212-1212-1212-1212-121212121212", taskId, null, { status: "running", durationMs: null }),
    ]);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await expect(sidebar.getByTestId("task-spent")).toHaveText("$0.0000");
    await expect(sidebar.getByText("Not run yet")).toBeVisible();
    await expect(sidebar.getByText("1 running, not counted")).toBeVisible();
    await expect(sidebar.getByTestId("task-spent-agent")).toHaveCount(0);
  });

  test("groups runs of one agent, labels a missing agent, counts failed runs", async ({ page, request }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const taskId = await makeTask(request, `E2E sidebar group ${Date.now()}`);
    await stubRuns(page, taskId, [
      run("31313131-3131-3131-3131-313131313131", taskId, 0.3, { agentTitle: "Engineer", durationMs: 30_000 }),
      run("32323232-3232-3232-3232-323232323232", taskId, 0.3, { agentTitle: "Engineer", durationMs: 30_000, status: "failed" }),
      run("33333333-3333-3333-3333-333333333334", taskId, 0.4, { agentTitle: null as unknown as string, durationMs: 3_725_000, status: "over_budget" }),
    ]);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await expect(sidebar.getByTestId("task-spent")).toHaveText("$1.0000");
    await expect(sidebar.getByText("across 3 runs", { exact: true })).toBeVisible();
    const rows = sidebar.getByTestId("task-spent-agent");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Engineer");
    await expect(rows.nth(0)).toContainText("$0.6000");
    await expect(rows.nth(0)).toContainText("1m 0s");
    await expect(rows.nth(0)).toContainText("60%");
    await expect(rows.nth(1)).toContainText("Unknown agent");
    await expect(rows.nth(1)).toContainText("1h 2m");
    await expect(rows.nth(1)).toContainText("40%");
  });

  test("zero total cost shows 0% rather than NaN", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar zero ${Date.now()}`);
    await stubRuns(page, taskId, [run("41414141-4141-4141-4141-414141414141", taskId, 0)]);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const row = page.getByRole("complementary", { name: "Task details" }).getByTestId("task-spent-agent");
    await expect(row).toContainText("0%");
    await expect(row).not.toContainText("NaN");
  });

  test("at exactly 1024px (lg) cost and bar are shown", async ({ page, request }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    const taskId = await makeTask(request, `E2E sidebar lg ${Date.now()}`);
    await stubTwoAgents(page, taskId);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    const row = page.getByRole("complementary", { name: "Task details" }).getByTestId("task-spent-agent").first();
    await expect(row.getByText("$0.7500")).toBeVisible();
    await expect(row.getByRole("progressbar")).toBeVisible();
  });
});
