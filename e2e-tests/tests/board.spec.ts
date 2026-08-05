import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam, ensureRoles, deleteTask } from "./fixtures.js";

test.describe("task board", () => {
  let projectId: string;
  let teamId: string;
  let createdTaskId: string | undefined;

  test.beforeAll(async ({ request }) => {
    const seeded = await ensureProjectAndTeam(request);
    projectId = seeded.projectId;
    teamId = seeded.teamId;
    await ensureRoles(request, teamId);
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

  test("creates a task, assigns a role, and moves it through valid transitions only", async ({ page }) => {
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

    // Assign a role via the card's select.
    const roleSelect = card.locator("select").first();
    const roleOptions = await roleSelect.locator("option").allTextContents();
    const firstRealRole = roleOptions.find((o) => o !== "Unassigned");
    expect(firstRealRole).toBeTruthy();
    await roleSelect.selectOption({ label: firstRealRole! });
    await expect(card.getByText(`Assigned: ${firstRealRole}`)).toBeVisible();

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
});
