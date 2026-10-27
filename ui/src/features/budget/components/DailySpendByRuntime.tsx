import { runtimeLabel, type ProjectDailySpend } from "@kompanion/shared";

type RuntimeTotal = { runtime: string; spendUsd: number; runCount: number };

function runs(n: number) {
  return `${n} ${n === 1 ? "run" : "runs"}`;
}

// One column per runtime that ran this month, biggest spender first. Built
// from the data, not from AgentRuntime, so a runtime added later gets a
// column (under its raw name) without touching this file.
function monthTotals(byDay: ProjectDailySpend[]): RuntimeTotal[] {
  const totals = new Map<string, RuntimeTotal>();
  for (const day of byDay) {
    for (const r of day.byRuntime) {
      const t = totals.get(r.runtime) ?? { runtime: r.runtime, spendUsd: 0, runCount: 0 };
      t.spendUsd += r.spendUsd;
      t.runCount += r.runCount;
      totals.set(r.runtime, t);
    }
  }
  return [...totals.values()].sort(
    (a, b) => b.spendUsd - a.spendUsd || a.runtime.localeCompare(b.runtime),
  );
}

// Zero-cost runs (local models on pi and opencode) are shown as $0.0000
// with their run count rather than hidden: they still ran.
export function DailySpendByRuntime({ byDay }: { byDay: ProjectDailySpend[] }) {
  const totals = monthTotals(byDay);

  return (
    <div className="space-y-2">
      <ul aria-label="Month to date by runtime" className="flex flex-wrap gap-2">
        {totals.map((t) => (
          <li
            key={t.runtime}
            data-runtime={t.runtime}
            className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
          >
            <span className="text-neutral-600">{runtimeLabel(t.runtime)}</span>{" "}
            <span className="font-medium tabular-nums text-neutral-800">
              ${t.spendUsd.toFixed(4)}
            </span>{" "}
            <span className="text-neutral-400">{runs(t.runCount)}</span>
          </li>
        ))}
      </ul>

      <table className="w-full text-xs" aria-label="Spend by day">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-1 font-normal">Day (UTC)</th>
            <th className="py-1 text-right font-normal">Total</th>
            {totals.map((t) => (
              <th key={t.runtime} className="py-1 text-right font-normal">
                {runtimeLabel(t.runtime)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {byDay.map((d) => (
            <tr key={d.day} className="border-b border-neutral-100 last:border-0">
              <td className="py-1 text-neutral-600">{d.day}</td>
              <td className="py-1 text-right tabular-nums text-neutral-700">
                ${d.spendUsd.toFixed(4)}{" "}
                <span className="text-neutral-400">{runs(d.runCount)}</span>
              </td>
              {totals.map((t) => {
                const r = d.byRuntime.find((x) => x.runtime === t.runtime);
                return (
                  <td
                    key={t.runtime}
                    data-runtime={t.runtime}
                    className="py-1 text-right tabular-nums text-neutral-700"
                  >
                    {r ? (
                      <>
                        ${r.spendUsd.toFixed(4)}{" "}
                        <span className="text-neutral-400">{runs(r.runCount)}</span>
                      </>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
