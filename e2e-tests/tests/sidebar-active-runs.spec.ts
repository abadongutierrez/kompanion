import { test, expect, type Page } from "@playwright/test";
import { ensureProjectAndTeam } from "./fixtures.js";

// Stubbed: real active runs need a real CLI and cost money.
function activeRun(n: number) {
  return {
    runId: `run-${n}`,
    taskId: `task-${n}`,
    taskTitle: `Task ${n}`,
    teamId: "team-1",
    teamName: "Team",
    agentTitle: "Engineer",
    runtime: "claude_code",
    model: null,
    startedAt: new Date().toISOString(),
  };
}

async function stubActiveRuns(page: Page, projectId: string, counts: () => number) {
  await page.route(`**/api/projects/${projectId}/runs/active`, (route) =>
    route.fulfill({ json: Array.from({ length: counts() }, (_, i) => activeRun(i + 1)) }),
  );
}

function runsLink(page: Page) {
  return page.getByRole("navigation").getByRole("link", { name: /^Runs/ });
}

test.describe("Sidebar: active run count on Runs", () => {
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await ensureProjectAndTeam(request));
  });

  test("shows the count on the Runs item from any section", async ({ page }) => {
    await stubActiveRuns(page, projectId, () => 3);
    await page.goto(`/projects/${projectId}/board`);
    await expect(runsLink(page)).toHaveText("Runs3");
  });

  test("hides the badge when nothing is running", async ({ page }) => {
    await stubActiveRuns(page, projectId, () => 0);
    await page.goto(`/projects/${projectId}/board`);
    await expect(runsLink(page)).toHaveText("Runs");
  });

  test("matches the Runs tab list and follows it as runs end", async ({ page }) => {
    let count = 2;
    await stubActiveRuns(page, projectId, () => count);
    await page.goto(`/projects/${projectId}/runs`);
    await expect(runsLink(page)).toHaveText("Runs2");
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(2);

    count = 0;
    // The query polls every 3s.
    await expect(runsLink(page)).toHaveText("Runs", { timeout: 8000 });
    await expect(page.getByText("Nothing is running right now.")).toBeVisible();
  });
});
