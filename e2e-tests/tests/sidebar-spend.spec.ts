import { test, expect, type Page } from "@playwright/test";
import { ensureProjectAndTeam } from "./fixtures.js";

// Both responses are stubbed: the card's rows come from the configured
// runtimes plus whatever ran this month, and real runs need a real CLI.
const runtimes = [
  { id: "rt-cc-1", name: "Claude Code", kind: "claude_code", binaryPath: null, configDir: null, createdAt: null },
  { id: "rt-cc-2", name: "Claude Code Encora", kind: "claude_code", binaryPath: null, configDir: "/tmp/cc2", createdAt: null },
  { id: "rt-oc2", name: "opencode2", kind: "opencode2", binaryPath: null, configDir: null, createdAt: null },
  { id: "rt-pi", name: "pi", kind: "pi", binaryPath: null, configDir: null, createdAt: null },
];

async function stub(page: Page, projectId: string) {
  await page.route("**/api/runtimes", (route) => route.fulfill({ json: runtimes }));
  await page.route(`**/api/projects/${projectId}/spend`, (route) =>
    route.fulfill({
      json: {
        projectId,
        totalSpendUsd: 5,
        totalRunCount: 4,
        monthSpendUsd: 1.86,
        periodStart: "2026-10-01T00:00:00Z",
        byDay: [
          {
            day: "2026-10-02",
            spendUsd: 1.86,
            runCount: 4,
            byRuntime: [
              { runtime: "claude_code", spendUsd: 1.85, runCount: 2 },
              { runtime: "opencode", spendUsd: 0.01, runCount: 1 },
              { runtime: "some_new_cli", spendUsd: 0, runCount: 1 },
            ],
          },
        ],
        // What the card lists: per configured Runtime, not per kind.
        byConfiguredRuntime: [
          { runtimeId: "rt-cc-2", runtime: "claude_code", runtimeName: "Claude Code Encora", spendUsd: 1.5, runCount: 1 },
          { runtimeId: "rt-cc-1", runtime: "claude_code", runtimeName: "Claude Code", spendUsd: 0.35, runCount: 1 },
          // A Runtime deleted since it ran.
          { runtimeId: "rt-gone", runtime: "opencode", runtimeName: null, spendUsd: 0.01, runCount: 1 },
          // No Runtime recorded (CLI defaults, or a run from before runtime_id).
          { runtimeId: null, runtime: "some_new_cli", runtimeName: null, spendUsd: 0, runCount: 1 },
        ],
      },
    }),
  );
}

test.describe("Sidebar: spent per runtime", () => {
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await ensureProjectAndTeam(request));
  });

  test("shows the month total and a row per runtime, idle configured ones at $0", async ({ page }) => {
    await stub(page, projectId);
    await page.goto(`/projects/${projectId}/board`);

    const list = page.getByRole("list", { name: "Spent by runtime" });
    await expect(list).toBeVisible();
    await expect(page.getByRole("navigation").filter({ has: list })).toContainText("Spent$1.86");

    await expect(list.locator('[data-runtime-key="rt-oc2"]')).toHaveText("opencode2$0.00");
    await expect(list.locator('[data-runtime-key="rt-pi"]')).toHaveText("pi$0.00");
    // Ran this month but its Runtime was deleted since: still shown, the money was spent.
    await expect(list.locator('[data-runtime-key="rt-gone"]')).toHaveText("opencode (deleted)$0.01");
    // No Runtime recorded; a kind the UI has no label for falls back to its raw value.
    await expect(list.locator('[data-runtime-key="kind:some_new_cli"]')).toHaveText(
      "some_new_cli (unattributed)$0.00",
    );
    await expect(list.getByRole("listitem")).toHaveCount(6);
  });

  // Two Claude Code runtimes are configured; each gets its own row by name.
  test("lists each configured runtime on its own row, by name", async ({ page }) => {
    await stub(page, projectId);
    await page.goto(`/projects/${projectId}/board`);

    const list = page.getByRole("list", { name: "Spent by runtime" });
    await expect(list.getByRole("listitem").filter({ hasText: "Claude Code Encora" })).toHaveText("Claude Code Encora$1.50");
    await expect(list.getByRole("listitem").filter({ hasText: /^Claude Code\b(?! Encora)/ })).toHaveText("Claude Code$0.35");
    await expect(list.locator('[data-runtime="claude_code"]')).toHaveCount(2);
  });
});
