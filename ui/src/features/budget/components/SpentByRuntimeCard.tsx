import { monthSpendByRuntime, runtimeLabel } from "@kompanion/shared";
import { useRuntimes } from "@/features/runtimes/index.js";
import { useProjectSpend } from "../hooks.js";

// The project's month-to-date spend, split per runtime, under the sidebar
// nav. Every configured runtime gets a row — $0 when it hasn't run yet — so
// the operator sees what each one costs at a glance. Runs record the runtime
// kind, not which configured Runtime they used, so two runtimes of one kind
// share a row.
export function SpentByRuntimeCard({ projectId }: { projectId: string }) {
  const spend = useProjectSpend(projectId);
  const runtimes = useRuntimes();

  if (!spend.data) return null;

  const configured = [...new Set((runtimes.data ?? []).map((r) => r.kind))];
  const totals = monthSpendByRuntime(spend.data.byDay, configured);

  return (
    <div className="space-y-1 border-t border-neutral-200 pt-3">
      <div className="flex items-baseline justify-between px-1 text-xs">
        <span className="font-medium text-neutral-500">Spent</span>
        <span className="font-medium tabular-nums text-neutral-700">
          ${spend.data.monthSpendUsd.toFixed(2)}
        </span>
      </div>
      <p className="px-1 text-[10px] text-neutral-400">this month (UTC)</p>
      {totals.length === 0 ? (
        <p className="px-1 text-xs text-neutral-400">No runtimes yet.</p>
      ) : (
        <ul aria-label="Spent by runtime" className="space-y-0.5">
          {totals.map((t) => (
            <li
              key={t.runtime}
              data-runtime={t.runtime}
              title={`${t.runCount} ${t.runCount === 1 ? "run" : "runs"}`}
              className="flex items-baseline justify-between gap-1 px-1 text-xs"
            >
              <span className="truncate text-neutral-600">{runtimeLabel(t.runtime)}</span>
              <span className="tabular-nums text-neutral-700">${t.spendUsd.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
