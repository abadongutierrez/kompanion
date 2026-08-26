import { test, expect, type APIRequestContext } from "@playwright/test";
import { ensureProjectAndTeam, deleteTask } from "./fixtures.js";

// QA verification for "Expand should open a page for the task not a dialog".
// board.spec.ts and task-page.spec.ts cover the happy path and the ids that do
// not resolve; these are the gaps left over — the real <a href>, the run state
// that was the whole point of "expanded", the sibling route the new path could
// have shadowed, and what the page does when the API itself fails.
test.describe("task page (QA)", () => {
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

  async function makeTask(request: APIRequestContext, title: string, description?: string) {
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, {
        data: { teamId, title, type: "story", ...(description ? { description } : {}) },
      })
      .then((r) => r.json());
    createdTaskId = task.id;
    return task.id;
  }

  // The existing tests click "Expand" and check the URL, which a
  // button + navigate() would also satisfy. The story asks for a page, so the
  // affordance itself should be a real link — middle-click / copy-link-address
  // / open-in-new-tab only work with an href.
  test("Expand is a real link with an href, not a scripted button", async ({ page, request }) => {
    const title = `QA href ${Date.now()}`;
    const taskId = await makeTask(request, title);

    await page.goto(`/projects/${projectId}/board`);
    const expand = page
      .locator("div.border-neutral-200", { hasText: title })
      .first()
      .getByRole("link", { name: "Expand" });

    await expect(expand).toHaveAttribute("href", `/projects/${projectId}/tasks/${taskId}`);
    expect(await expand.evaluate((el) => el.tagName)).toBe("A");
  });

  // The deleted modal's stated purpose was giving the transcript the full
  // height. The page must still render the latest run's status line and the
  // transcript; no existing test exercises the has-a-run branch at all.
  test("renders the latest run's status line and transcript", async ({ page, request }) => {
    const title = `QA run ${Date.now()}`;
    const taskId = await makeTask(request, title);

    // Real runs need the Claude CLI; stub the runs list so the run branch of
    // the page is exercised deterministically.
    const runId = "11111111-1111-1111-1111-111111111111";
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({
        json: [
          {
            id: runId,
            taskId,
            agentId: null,
            status: "succeeded",
            createdAt: "2026-08-26T12:00:00.000Z",
            durationMs: 4200,
            costUsd: 0.1234,
          },
        ],
      }),
    );
    await page.route(`**/runs/${runId}/events`, (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: "event: done\ndata: {}\n\n",
      }),
    );

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("succeeded")).toBeVisible();
    await expect(page.getByText("4.2s")).toBeVisible();
    await expect(page.getByText("$0.1234")).toBeVisible();
    await expect(page.getByText("This task has not been run yet.")).toHaveCount(0);
  });

  test("shows the task description on the page", async ({ page, request }) => {
    const title = `QA desc ${Date.now()}`;
    const description = `QA description body ${Date.now()}`;
    const taskId = await makeTask(request, title, description);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await expect(page.getByText(description)).toBeVisible();
  });

  // The new route is declared before /projects/:projectId/:section? — check it
  // did not shadow the sibling board/repositories sections.
  test("the new route does not shadow the project's other sections", async ({ page }) => {
    await page.goto(`/projects/${projectId}/board`);
    await expect(page.getByRole("button", { name: "+ New Task" })).toBeVisible();

    await page.goto(`/projects/${projectId}/repositories`);
    await expect(page.getByRole("button", { name: "+ New Task" })).toHaveCount(0);
  });

  // A task open on the page and then deleted elsewhere: the list is polled, so
  // the page should fall into "Task not found" rather than showing a ghost.
  test("a task deleted while the page is open falls back to Task not found", async ({
    page,
    request,
  }) => {
    const title = `QA deleted ${Date.now()}`;
    const taskId = await makeTask(request, title);

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await deleteTask(request, teamId, taskId);
    createdTaskId = undefined;

    await expect(page.getByText("Task not found.")).toBeVisible({ timeout: 15_000 });
  });

  // The same failure mode 7b98906 fixed for the no-team case, reached a
  // different way: if the teams request errors the page has no resolved data
  // and no error branch.
  test("an API error does not leave the page stuck on Loading…", async ({ page, request }) => {
    const title = `QA error ${Date.now()}`;
    const taskId = await makeTask(request, title);

    await page.route(`**/api/projects/${projectId}/teams`, (route) =>
      route.fulfill({ status: 500, json: { error: "boom" } }),
    );

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await expect(page.getByText("Could not load this task.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "← Board" })).toBeVisible();
  });
});
