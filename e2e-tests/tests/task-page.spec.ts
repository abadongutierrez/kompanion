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

  test("all runs list, newest open, and opening one closes the others", async ({
    page,
    request,
  }) => {
    const title = `E2E accordion ${Date.now()}`;
    const taskId = await makeTask(request, title);

    // Real runs need the Claude CLI and cost money; stub three so the
    // accordion is exercised deterministically. Newest first, matching the
    // order listRuns returns.
    const ids = [
      "aaaaaaaa-1111-1111-1111-111111111111",
      "bbbbbbbb-2222-2222-2222-222222222222",
      "cccccccc-3333-3333-3333-333333333333",
    ];
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({
        json: [
          { id: ids[0], taskId, agentId: null, agentTitle: "QA", status: "succeeded",
            createdAt: "2026-08-26T12:30:00.000Z", durationMs: 3000, costUsd: 0.5 },
          { id: ids[1], taskId, agentId: null, agentTitle: "Engineer", status: "failed",
            createdAt: "2026-08-26T12:20:00.000Z", durationMs: 2000, costUsd: null },
          { id: ids[2], taskId, agentId: null, agentTitle: "Engineer", status: "succeeded",
            createdAt: "2026-08-26T12:10:00.000Z", durationMs: 1000, costUsd: 0.25 },
        ],
      }),
    );
    for (const id of ids) {
      await page.route(`**/runs/${id}/events`, (route) =>
        route.fulfill({
          contentType: "text/event-stream",
          body: "event: done\ndata: {}\n\n",
        }),
      );
    }

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // Every run is listed, not just the latest — each agent and cost shows.
    // The toggle is a dedicated button; the row's own text is not clickable,
    // so the run's details stay selectable.
    const rows = page.getByRole("button", { name: /logs$/ });
    await expect(rows).toHaveCount(3);
    await expect(page.getByText("QA", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("$0.2500")).toBeVisible();
    // A run that never finished has no cost, and must not read as free.
    await expect(page.getByText("cost unknown")).toBeVisible();

    // The newest run starts open, and its button says so.
    await expect(rows.nth(0)).toHaveText("▾ Hide logs");
    await expect(rows.nth(1)).toHaveText("▸ Show logs");
    // The button names the region it opens.
    const controls = await rows.nth(0).getAttribute("aria-controls");
    await expect(page.locator(`#${controls}`)).toBeVisible();

    await expect(rows.nth(0)).toHaveAttribute("aria-expanded", "true");
    await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "false");
    await expect(rows.nth(2)).toHaveAttribute("aria-expanded", "false");

    // Opening another closes the one that was open — exactly one at a time.
    await rows.nth(2).click();
    await expect(rows.nth(2)).toHaveAttribute("aria-expanded", "true");
    await expect(rows.nth(0)).toHaveAttribute("aria-expanded", "false");
    await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "false");

    // A row toggles: clicking the open one collapses it, leaving none open.
    // The newest must not spring back open here — "collapsed" is a real
    // state, not the absence of a choice.
    await rows.nth(2).click();
    for (const i of [0, 1, 2]) {
      await expect(rows.nth(i)).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("an opencode run is reduced with the opencode reducer, not Claude's", async ({
    page,
    request,
  }) => {
    const title = `E2E opencode ${Date.now()}`;
    const taskId = await makeTask(request, title);

    const runId = "dddddddd-4444-4444-4444-444444444444";
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({
        json: [
          {
            id: runId,
            taskId,
            agentId: null,
            agentTitle: "Engineer (opencode)",
            runtime: "opencode",
            model: "ollama/qwen2.5-coder:7b",
            status: "succeeded",
            createdAt: "2026-08-26T18:21:40.000Z",
            durationMs: 12253,
            costUsd: 0,
          },
        ],
      }),
    );

    // opencode's event shape, transcribed from a real run — nothing here is
    // meaningful to the Claude reducer, so rendering it proves the runtime
    // stored on the run is what picks the reducer.
    const events = [
      { seq: 0, payload: { type: "step_start", part: { type: "step-start" } } },
      { seq: 1, payload: { type: "text", part: { type: "text", text: "opencode said this" } } },
      {
        seq: 3,
        payload: {
          type: "tool_use",
          part: {
            type: "tool",
            id: "prt_tool_1",
            tool: "bash",
            state: { status: "completed", input: { command: "ls" }, output: "hello.txt" },
          },
        },
      },
      {
        seq: 2,
        payload: {
          type: "step_finish",
          part: { type: "step-finish", reason: "stop", cost: 0, tokens: { input: 2050, output: 35 } },
        },
      },
    ];
    await page.route(`**/runs/${runId}/events`, (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body:
          events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
          "event: done\ndata: {}\n\n",
      }),
    );

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // Runtime and model are on the row, so you can tell what produced a run.
    await expect(page.getByText("opencode", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("ollama/qwen2.5-coder:7b")).toBeVisible();

    // The text part rendered — the Claude reducer would have ignored it.
    await expect(page.getByText("opencode said this")).toBeVisible();

    // A local model really is free, so zero is shown as zero rather than
    // being reported as unknown.
    await expect(page.getByText("$0.0000")).toBeVisible();
    await expect(page.getByText("cost unknown")).toHaveCount(0);

    // The tool block is a <details>, collapsed until asked otherwise.
    const details = page.locator("details");
    await expect(details).toHaveCount(1);
    await expect(page.locator("details[open]")).toHaveCount(0);

    const expandAll = page.getByRole("button", { name: /Expand all/ });
    await expandAll.click();
    await expect(page.locator("details[open]")).toHaveCount(1);

    // Individual toggling still works afterwards — the control sets a
    // starting state, it does not pin the blocks open.
    await page.locator("details[open] > summary").first().click();
    await expect(page.locator("details[open]")).toHaveCount(0);

    await page.getByRole("button", { name: /Collapse all/ }).click();
    await expect(page.locator("details[open]")).toHaveCount(0);
  });

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
