import { test, expect, type APIRequestContext } from "@playwright/test";
import { ensureProjectAndTeam, deleteTask } from "./fixtures.js";

// The task page's right sidebar: the "Status" section shows the current
// status and one button per transition TASK_STATUS_TRANSITIONS allows.
test.describe("task page sidebar status controls", () => {
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

  async function serverStatus(request: APIRequestContext, taskId: string) {
    const tasks: { id: string; status: string }[] = await request
      .get(`/api/teams/${teamId}/tasks`)
      .then((r) => r.json());
    return tasks.find((t) => t.id === taskId)?.status;
  }

  test("walks a task from Backlog to Done, offering only legal moves", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar status ${Date.now()}`);
    await page.goto(`/projects/${projectId}/tasks/${taskId}`);

    const sidebar = page.getByRole("complementary", { name: "Task details" });
    const status = sidebar.getByTestId("task-status");
    const moves = sidebar.getByLabel("Move task to").getByRole("button");

    await expect(status).toHaveText("Backlog");
    await expect(moves).toHaveText(["→ In Progress"]);

    await moves.getByText("→ In Progress").click();
    await expect(status).toHaveText("In Progress");
    await expect(moves).toHaveText(["→ In Review", "→ Blocked", "→ Backlog"]);
    expect(await serverStatus(request, taskId)).toBe("in_progress");

    await moves.getByText("→ Blocked").click();
    await expect(status).toHaveText("Blocked");
    await expect(moves).toHaveText(["→ In Progress", "→ In Review", "→ Backlog"]);

    await moves.getByText("→ In Review").click();
    await expect(status).toHaveText("In Review");
    await expect(moves).toHaveText(["→ Done", "→ In Progress", "→ Blocked"]);

    await moves.getByText("→ Done").click();
    await expect(status).toHaveText("Done");
    // Done is terminal: the button row is gone, not just empty.
    await expect(sidebar.getByLabel("Move task to")).toHaveCount(0);
    expect(await serverStatus(request, taskId)).toBe("done");
  });

  test("shows the server's error and keeps the status when a move is refused", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar status refused ${Date.now()}`);
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/status`, (route) =>
      route.fulfill({ status: 409, json: { error: "cannot transition task from backlog to in_progress" } }),
    );
    await page.goto(`/projects/${projectId}/tasks/${taskId}`);

    const sidebar = page.getByRole("complementary", { name: "Task details" });
    await sidebar.getByRole("button", { name: "→ In Progress" }).click();

    await expect(sidebar.getByText("cannot transition task from backlog to in_progress")).toBeVisible();
    await expect(sidebar.getByTestId("task-status")).toHaveText("Backlog");
    expect(await serverStatus(request, taskId)).toBe("backlog");
  });

  test("disables the buttons while a move is in flight", async ({ page, request }) => {
    const taskId = await makeTask(request, `E2E sidebar status pending ${Date.now()}`);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/status`, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/projects/${projectId}/tasks/${taskId}`);

    const sidebar = page.getByRole("complementary", { name: "Task details" });
    const button = sidebar.getByRole("button", { name: "→ In Progress" });
    await button.click();
    await expect(button).toBeDisabled();

    release();
    await expect(sidebar.getByTestId("task-status")).toHaveText("In Progress");
  });
});
