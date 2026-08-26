import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam, ensureAgents, deleteTask } from "./fixtures.js";

test.describe("task board", () => {
  let projectId: string;
  let teamId: string;
  let createdTaskId: string | undefined;

  test.beforeAll(async ({ request }) => {
    const seeded = await ensureProjectAndTeam(request);
    projectId = seeded.projectId;
    teamId = seeded.teamId;
    await ensureAgents(request, teamId);
  });

  test.afterEach(async ({ request }) => {
    if (createdTaskId) {
      await deleteTask(request, teamId, createdTaskId);
      createdTaskId = undefined;
    }
  });

  test("auto-selects the existing project/team and shows the board", async ({ page }) => {
    await page.goto(`/projects/${projectId}/board`);
    await expect(page.getByRole("heading", { name: "SDLC Kompanion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New Task" })).toBeVisible();
    // Column headers are rendered as e.g. "Backlog (0)" and only made to
    // *look* upper-case via a CSS `uppercase` class — match case-insensitively
    // against the real DOM text, not the rendered appearance.
    await expect(page.getByText(/^backlog/i)).toBeVisible();
    await expect(page.getByText(/^in progress/i)).toBeVisible();
    await expect(page.getByText(/^done/i)).toBeVisible();
  });

  test("creates a task, assigns an agent, and moves it through valid transitions only", async ({ page }) => {
    await page.goto(`/projects/${projectId}/board`);

    const title = `E2E task ${Date.now()}`;
    await page.getByRole("button", { name: "+ New Task" }).click();
    await page.getByPlaceholder("Task title").fill(title);
    await page.getByRole("button", { name: "Create task" }).click();

    // Scoped to the task card's own container class (not a generic `div` +
    // text filter, which would also match ancestor column/board wrappers).
    const card = page.locator("div.border-neutral-200", { hasText: title }).first();
    await expect(card).toBeVisible();

    // New tasks start in Backlog — TASK_STATUS_TRANSITIONS.backlog is only
    // ["in_progress"], so that's the *only* transition button that should
    // render; assert the others are simply not offered, rather than
    // offered-but-disabled.
    await expect(card.getByRole("button", { name: "→ in progress" })).toBeVisible();
    await expect(card.getByRole("button", { name: "→ blocked" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "→ done" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "→ in review" })).toHaveCount(0);

    // Assign an agent via the card's select.
    const agentSelect = card.locator("select").first();
    const agentOptions = await agentSelect.locator("option").allTextContents();
    const firstRealAgent = agentOptions.find((o) => o !== "Unassigned");
    expect(firstRealAgent).toBeTruthy();
    await agentSelect.selectOption({ label: firstRealAgent! });
    await expect(card.getByText(`Assigned: ${firstRealAgent}`)).toBeVisible();

    // Backlog -> In Progress.
    await card.getByRole("button", { name: "→ in progress" }).click();
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "→ in progress" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "→ in review" })).toBeVisible();
    await expect(card.getByRole("button", { name: "→ blocked" })).toBeVisible();
    await expect(card.getByRole("button", { name: "→ backlog" })).toBeVisible();

    // Grab the task id back out so afterEach can clean it up — the id
    // isn't rendered anywhere, so read it back via the API by title.
    const tasks: { id: string; title: string }[] = await page
      .request.get(`/api/teams/${teamId}/tasks`)
      .then((r) => r.json());
    createdTaskId = tasks.find((t) => t.title === title)?.id;
    expect(createdTaskId).toBeTruthy();
  });

  test("Expand opens the task's own page, not a dialog", async ({ page, request }) => {
    const title = `E2E expand ${Date.now()}`;
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, { data: { teamId, title, type: "story" } })
      .then((r) => r.json());
    createdTaskId = task.id;

    await page.goto(`/projects/${projectId}/board`);
    const card = page.locator("div.border-neutral-200", { hasText: title }).first();
    await card.getByRole("link", { name: "Expand" }).click();

    // A real route, so the URL changes and the board is gone — the old
    // behaviour rendered a modal on top of the board instead.
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/tasks/${task.id}$`));
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ New Task" })).toHaveCount(0);

    // Reloading the URL still lands on the task (the modal had no URL at all).
    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.getByRole("link", { name: "← Board" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/board$`));
    await expect(page.getByRole("button", { name: "+ New Task" })).toBeVisible();
  });

  test("the Runs section lists each run with its agent and cost", async ({
    page,
    request,
  }) => {
    const title = `E2E runs ${Date.now()}`;
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, { data: { teamId, title, type: "story" } })
      .then((r) => r.json());
    createdTaskId = task.id;

    await page.goto(`/projects/${projectId}/board`);
    const card = page.locator("div.border-neutral-200", { hasText: title }).first();

    // Collapsed by default, like Comments — and a never-run task says so
    // rather than showing an empty list.
    const runs = card.locator("details", { hasText: "Runs" }).first();
    await runs.getByText("Runs", { exact: false }).first().click();
    await expect(runs.getByText("Not run yet.")).toBeVisible();

    // The count only appears once there is at least one run, so an unrun
    // task reads "Runs", never "Runs (0)".
    await expect(card.getByText("Runs (", { exact: false })).toHaveCount(0);
  });
});
