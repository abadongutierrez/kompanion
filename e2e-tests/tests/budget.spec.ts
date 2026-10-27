import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam } from "./fixtures.js";

// The spend response is stubbed: real runs need a real CLI, and the split
// has to include a zero-cost runtime and one the UI has never heard of.
// The grouping itself is checked server-side in SpendPersistenceTest.
test.describe("Budget tab: daily spend split by runtime", () => {
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await ensureProjectAndTeam(request));
  });

  test("each day shows its total and the runtime split, with month-to-date per runtime", async ({ page }) => {
    await page.route(`**/api/projects/${projectId}/spend`, (route) =>
      route.fulfill({
        json: {
          projectId,
          totalSpendUsd: 5,
          totalRunCount: 6,
          monthSpendUsd: 1.86,
          periodStart: "2026-10-01T00:00:00Z",
          byDay: [
            {
              day: "2026-10-02",
              spendUsd: 1.11,
              runCount: 2,
              byRuntime: [
                { runtime: "claude_code", spendUsd: 1.1, runCount: 1 },
                { runtime: "opencode2", spendUsd: 0.01, runCount: 1 },
              ],
            },
            {
              day: "2026-10-01",
              spendUsd: 0.75,
              runCount: 4,
              byRuntime: [
                { runtime: "claude_code", spendUsd: 0.75, runCount: 2 },
                { runtime: "opencode", spendUsd: 0, runCount: 1 },
                { runtime: "pi", spendUsd: 0, runCount: 1 },
              ],
            },
          ],
        },
      }),
    );

    await page.goto(`/projects/${projectId}/budget`);

    await expect(page.getByRole("heading", { name: "By day this month (UTC)" })).toBeVisible();

    const table = page.getByRole("table", { name: "Spend by day" });
    await expect(table.getByRole("columnheader", { name: "Day (UTC)" })).toBeVisible();
    // Agent-form labels for known runtimes, the raw value for a new one.
    for (const label of ["Claude Code", "opencode", "pi", "opencode2"]) {
      await expect(table.getByRole("columnheader", { name: label, exact: true })).toBeVisible();
    }

    const day1 = table.getByRole("row").filter({ hasText: "2026-10-01" });
    await expect(day1).toContainText("$0.7500 4 runs");
    await expect(day1.locator('[data-runtime="claude_code"]')).toHaveText("$0.7500 2 runs");
    // Zero-cost runs stay visible with their count.
    await expect(day1.locator('[data-runtime="pi"]')).toHaveText("$0.0000 1 run");
    await expect(day1.locator('[data-runtime="opencode"]')).toHaveText("$0.0000 1 run");
    // A runtime that didn't run that day is a dash, not $0.
    await expect(day1.locator('[data-runtime="opencode2"]')).toHaveText("—");

    const mtd = page.getByRole("list", { name: "Month to date by runtime" });
    await expect(mtd.locator('[data-runtime="claude_code"]')).toHaveText("Claude Code $1.8500 3 runs");
    await expect(mtd.locator('[data-runtime="opencode2"]')).toHaveText("opencode2 $0.0100 1 run");
    await expect(mtd.locator('[data-runtime="pi"]')).toHaveText("pi $0.0000 1 run");
    await expect(mtd.getByRole("listitem")).toHaveCount(4);
  });
});
