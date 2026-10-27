import { spendPerConfiguredRuntime } from "@kompanion/shared";
import { useRuntimes } from "@/features/runtimes/index.js";
import { useProjectSpend } from "../hooks.js";

// The project's month-to-date spend, split per configured runtime, under the
// sidebar nav. Every configured runtime gets a row by name — $0 when it
// hasn't run yet — so two runtimes of one kind (two Claude accounts) each
// show what they cost. Runs that recorded no runtime get one row per kind.
export function SpentByRuntimeCard({ projectId }: { projectId: string }) {
  const spend = useProjectSpend(projectId);
  const runtimes = useRuntimes();

  if (!spend.data) return null;

  const rows = spendPerConfiguredRuntime(spend.data.byConfiguredRuntime ?? [], runtimes.data ?? []);

  return (
    <div className="space-y-1 border-t border-neutral-200 pt-3">
      <div className="flex items-baseline justify-between px-1 text-xs">
        <span className="font-medium text-neutral-500">Spent</span>
        <span className="font-medium tabular-nums text-neutral-700">
          ${spend.data.monthSpendUsd.toFixed(2)}
        </span>
      </div>
      <p className="px-1 text-[10px] text-neutral-400">this month (UTC)</p>
      {rows.length === 0 ? (
        <p className="px-1 text-xs text-neutral-400">No runtimes yet.</p>
      ) : (
        <ul aria-label="Spent by runtime" className="space-y-0.5">
          {rows.map((r) => (
            <li
              key={r.key}
              data-runtime={r.runtime}
              data-runtime-key={r.key}
              title={`${r.label}: ${r.runCount} ${r.runCount === 1 ? "run" : "runs"}`}
              className="flex items-baseline justify-between gap-1 px-1 text-xs"
            >
              <span className="truncate text-neutral-600">{r.label}</span>
              <span className="tabular-nums text-neutral-700">${r.spendUsd.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
