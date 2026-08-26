import { test, expect, type APIRequestContext } from "@playwright/test";
import { ensureProjectAndTeam, deleteTask } from "./fixtures.js";

// Edge cases around Expand-as-a-page that board.spec.ts's happy path does not
// cover: real browser history, deep links, and ids that do not resolve.
test.describe("task page", () => {
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

  test("browser back returns to the board (the modal used to leave the app)", async ({
    page,
    request,
  }) => {
    const title = `E2E back ${Date.now()}`;
    const taskId = await makeTask(request, title);

    await page.goto(`/projects/${projectId}/board`);
    await page
      .locator("div.border-neutral-200", { hasText: title })
      .first()
      .getByRole("link", { name: "Expand" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/tasks/${taskId}$`));

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/board$`));
    await expect(page.getByRole("button", { name: "+ New Task" })).toBeVisible();
  });

  test("a deep link opened cold renders the task and its not-yet-run state", async ({
    page,
    request,
  }) => {
    const title = `E2E deep link ${Date.now()}`;
    const taskId = await makeTask(request, title);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("This task has not been run yet.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an unknown task id shows Task not found, not a spinner forever", async ({ page }) => {
    await page.goto(`/projects/${projectId}/tasks/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText("Task not found.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "← Board" })).toBeVisible();
  });

  test("an unknown project id does not hang on Loading…", async ({ page }) => {
    await page.goto(`/projects/00000000-0000-0000-0000-000000000000/tasks/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15_000 });
  });
});
