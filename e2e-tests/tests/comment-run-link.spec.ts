import { test, expect, type Page } from "@playwright/test";
import { ensureProjectAndTeam, deleteTask } from "./fixtures.js";

// A comment's "Run as <agent>" button goes inert once that comment has a run
// for that agent, and a "View run" link to the run takes its place. Real runs
// need an agent CLI and cost money, so the comment and run lists are stubbed,
// the way skills.spec.ts does it; the task itself is real.
test.describe("comment run link", () => {
  let projectId: string;
  let teamId: string;
  let taskId: string | undefined;

  const linkedRunId = "aaaaaaaa-1111-1111-1111-111111111111";
  const newestRunId = "bbbbbbbb-2222-2222-2222-222222222222";
  const ranAgent = { id: "11111111-0000-0000-0000-000000000001", title: "Ran Agent", slug: "ran-agent" };
  const freshAgent = { id: "11111111-0000-0000-0000-000000000002", title: "Fresh Agent", slug: "fresh-agent" };
  const busyAgent = { id: "11111111-0000-0000-0000-000000000003", title: "Busy Agent", slug: "busy-agent" };

  test.beforeAll(async ({ request }) => {
    ({ projectId, teamId } = await ensureProjectAndTeam(request));
  });

  test.afterEach(async ({ request }) => {
    if (taskId) await deleteTask(request, teamId, taskId);
    taskId = undefined;
  });

  type CommentRun = { agentId: string; runId: string; status: string };
  const defaultRuns: CommentRun[] = [
    { agentId: ranAgent.id, runId: linkedRunId, status: "succeeded" },
    { agentId: busyAgent.id, runId: newestRunId, status: "running" },
  ];

  async function stubTask(
    page: Page,
    request: import("@playwright/test").APIRequestContext,
    commentRuns: CommentRun[] = defaultRuns,
  ) {
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, {
        data: { teamId, title: `E2E comment run ${Date.now()}`, type: "story" },
      })
      .then((r) => r.json());
    taskId = task.id;

    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/comments`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            json: [
              {
                id: "cccccccc-0000-0000-0000-000000000001",
                taskId,
                agentId: null,
                authorTitle: null,
                body: "@ran-agent @fresh-agent @busy-agent please look",
                mentionedAgents: [ranAgent, freshAgent, busyAgent],
                runs: commentRuns,
                createdAt: "2026-10-01T12:00:00.000Z",
                updatedAt: null,
              },
            ],
          })
        : route.continue(),
    );

    const base = {
      taskId, agentId: null, runtime: "claude_code", model: null, summary: null,
      rawOutput: null, costUsd: null, durationMs: 1000, inputTokens: null,
      outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null,
      instanceHash: null, gitSha: null, gitDirty: null, skills: [],
    };
    // Newest first, so the page's "auto" choice would open the busy run — the
    // link has to beat that and open the older, linked one.
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({
        json: [
          { ...base, id: newestRunId, agentId: busyAgent.id, agentTitle: "Busy Agent", status: "running", createdAt: "2026-10-01T12:30:00.000Z" },
          { ...base, id: linkedRunId, agentId: ranAgent.id, agentTitle: "Ran Agent", status: "succeeded", createdAt: "2026-10-01T12:10:00.000Z" },
        ],
      }),
    );
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs/*/events`, (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }),
    );
  }

  const logsToggle = (page: Page, agentTitle: string) =>
    page
      .locator("div.rounded.border", { hasText: agentTitle })
      .getByRole("button", { name: /Show logs|Hide logs/ });

  test("disables Run as for an agent that already ran and links to its run", async ({ page, request }) => {
    await stubTask(page, request);
    await page.goto(`/projects/${projectId}/tasks/${taskId}?team=${teamId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();

    await expect(page.getByRole("button", { name: "Run as Ran Agent" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Run as Busy Agent" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Run as Fresh Agent" })).toBeEnabled();

    const links = page.getByRole("link", { name: /^View run/ });
    await expect(links).toHaveCount(2);
    await expect(page.getByRole("link", { name: "View run (running)" })).toHaveAttribute(
      "href",
      new RegExp(`[?&]run=${newestRunId}`),
    );
    await expect(page.getByRole("link", { name: "View run", exact: true })).toHaveAttribute(
      "href",
      new RegExp(`/projects/${projectId}/tasks/${taskId}\\?team=${teamId}&run=${linkedRunId}$`),
    );
  });

  test("failed or over-budget runs leave Run as enabled so it can be retried", async ({ page, request }) => {
    await stubTask(page, request, [
      { agentId: ranAgent.id, runId: linkedRunId, status: "failed" },
      { agentId: busyAgent.id, runId: newestRunId, status: "over_budget" },
    ]);
    await page.goto(`/projects/${projectId}/tasks/${taskId}?team=${teamId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();

    await expect(page.getByRole("button", { name: "Run as Ran Agent" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Run as Busy Agent" })).toBeEnabled();
    await expect(page.getByRole("link", { name: /^View run/ })).toHaveCount(0);
  });

  test("a deep link with ?run= opens that run, not the newest", async ({ page, request }) => {
    await stubTask(page, request);
    await page.goto(`/projects/${projectId}/tasks/${taskId}?team=${teamId}&run=${linkedRunId}`);

    await expect(logsToggle(page, "Ran Agent")).toHaveAttribute("aria-expanded", "true");
    await expect(logsToggle(page, "Busy Agent")).toHaveAttribute("aria-expanded", "false");
  });

  test("clicking View run on the task page shows that run", async ({ page, request }) => {
    await stubTask(page, request);
    await page.goto(`/projects/${projectId}/tasks/${taskId}?team=${teamId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();

    await page.getByRole("link", { name: "View run", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`run=${linkedRunId}`));

    // The link lives in the Comments tab of the very page it points at, so
    // the page does not remount: it must switch to Runs and open that run.
    await expect(page.getByRole("tab", { name: /^Runs/ })).toHaveAttribute("aria-selected", "true");
    await expect(logsToggle(page, "Ran Agent")).toHaveAttribute("aria-expanded", "true");
  });

  test("clicking the same View run again shows the run again", async ({ page, request }) => {
    await stubTask(page, request);
    await page.goto(`/projects/${projectId}/tasks/${taskId}?team=${teamId}`);
    await page.getByRole("tab", { name: /^Comments/ }).click();
    await page.getByRole("link", { name: "View run", exact: true }).click();
    await expect(logsToggle(page, "Ran Agent")).toHaveAttribute("aria-expanded", "true");

    // Collapse the run and go back to Comments: `?run=` is unchanged, so the
    // second click must still switch tabs and reopen the run.
    await logsToggle(page, "Ran Agent").click();
    await expect(logsToggle(page, "Ran Agent")).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("tab", { name: /^Comments/ }).click();

    const runsFetched = page.waitForRequest(
      (r) => r.method() === "GET" && r.url().endsWith(`/tasks/${taskId}/runs`),
    );
    await page.getByRole("link", { name: "View run", exact: true }).click();
    await runsFetched;

    await expect(page.getByRole("tab", { name: /^Runs/ })).toHaveAttribute("aria-selected", "true");
    await expect(logsToggle(page, "Ran Agent")).toHaveAttribute("aria-expanded", "true");
  });
});
