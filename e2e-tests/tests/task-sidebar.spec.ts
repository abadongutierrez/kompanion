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

  const run = (id: string, taskId: string, costUsd: number | null) => ({
    id, taskId, agentId: null, agentTitle: "Engineer", status: "succeeded",
    createdAt: "2026-08-26T12:00:00.000Z", durationMs: 1000, costUsd,
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
});
