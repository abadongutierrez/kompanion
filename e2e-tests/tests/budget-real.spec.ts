import { test, expect } from "@playwright/test";

type RuntimeSpend = { runtime: string; spendUsd: number; runCount: number };
type Day = { day: string; spendUsd: number; runCount: number; byRuntime: RuntimeSpend[] };
type Spend = { monthSpendUsd: number; byDay: Day[] };

const money = (n: number) => `$${n.toFixed(4)}`;
const runs = (n: number) => `${n} ${n === 1 ? "run" : "runs"}`;

// No stub: the real backend's split, rendered by the real Budget tab. Runs
// need a real CLI, so this uses whichever project already has runs this
// month and skips when none does.
test.describe("Budget tab against the real backend", () => {
  test("the split adds up and the tab shows what the API returns", async ({ page, request }) => {
    const projects: { id: string }[] = await (await request.get("/api/projects")).json();
    let found: { id: string; spend: Spend } | undefined;
    for (const p of projects) {
      const spend: Spend = await (await request.get(`/api/projects/${p.id}/spend`)).json();
      if (spend.byDay.length > 0) {
        found = { id: p.id, spend };
        break;
      }
    }
    test.skip(!found, "no project has runs this month");
    const { id, spend } = found!;

    const mtd = new Map<string, { spendUsd: number; runCount: number }>();
    for (const d of spend.byDay) {
      expect(d.byRuntime.length).toBeGreaterThan(0);
      expect(d.byRuntime.reduce((a, r) => a + r.runCount, 0)).toBe(d.runCount);
      expect(d.byRuntime.reduce((a, r) => a + r.spendUsd, 0)).toBeCloseTo(d.spendUsd, 8);
      for (const r of d.byRuntime) {
        const t = mtd.get(r.runtime) ?? { spendUsd: 0, runCount: 0 };
        t.spendUsd += r.spendUsd;
        t.runCount += r.runCount;
        mtd.set(r.runtime, t);
      }
    }
    expect([...mtd.values()].reduce((a, t) => a + t.spendUsd, 0)).toBeCloseTo(spend.monthSpendUsd, 8);

    await page.goto(`/projects/${id}/budget`);
    const table = page.getByRole("table", { name: "Spend by day" });
    await expect(table.getByRole("columnheader", { name: "Day (UTC)" })).toBeVisible();

    for (const d of spend.byDay) {
      const row = table.getByRole("row").filter({ hasText: d.day });
      await expect(row).toContainText(`${money(d.spendUsd)} ${runs(d.runCount)}`);
      for (const r of d.byRuntime) {
        await expect(row.locator(`[data-runtime="${r.runtime}"]`)).toHaveText(
          `${money(r.spendUsd)} ${runs(r.runCount)}`,
        );
      }
    }

    const list = page.getByRole("list", { name: "Month to date by runtime" });
    await expect(list.getByRole("listitem")).toHaveCount(mtd.size);
    for (const [runtime, t] of mtd) {
      await expect(list.locator(`[data-runtime="${runtime}"]`)).toContainText(
        `${money(t.spendUsd)} ${runs(t.runCount)}`,
      );
    }
  });
});
