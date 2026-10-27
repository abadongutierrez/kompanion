import type { TaskRun } from "@kompanion/shared";

// Compact run time for the sidebar: 42s, 3m 20s, 1h 5m.
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Right-hand column of the task page. For now it only shows what the task
// has cost so far, split by Agent; more sections can stack under it.
//
// Runs still in progress are left out entirely — not even the live estimate
// the board card shows. Only finished runs count.
//
// Below the lg breakpoint each Agent row drops its cost and progress bar and
// keeps only its time and percentage.
export function TaskSidebar({ runs }: { runs: TaskRun[] | undefined }) {
  const finished = (runs ?? []).filter((r) => r.status !== "running");
  const runningCount = (runs ?? []).length - finished.length;
  const totalCostUsd = finished.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const runCount = finished.length;

  const byAgent = new Map<string, { costUsd: number; durationMs: number }>();
  for (const r of finished) {
    const name = r.agentTitle ?? "Unknown agent";
    const row = byAgent.get(name) ?? { costUsd: 0, durationMs: 0 };
    row.costUsd += r.costUsd ?? 0;
    row.durationMs += r.durationMs ?? 0;
    byAgent.set(name, row);
  }
  const agents = [...byAgent.entries()].sort((a, b) => b[1].costUsd - a[1].costUsd);

  return (
    <aside
      aria-label="Task details"
      className="w-36 shrink-0 space-y-4 self-start rounded border border-neutral-200 p-3 lg:w-56"
    >
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Spent so far
        </h3>
        <p className="mt-1 text-lg font-medium" data-testid="task-spent">
          ${totalCostUsd.toFixed(4)}
        </p>
        <p className="text-xs text-neutral-400">
          {runCount === 0 ? "Not run yet" : `across ${runCount} run${runCount === 1 ? "" : "s"}`}
        </p>
        {runningCount > 0 && (
          <p className="text-xs text-neutral-400">
            {runningCount} running, not counted
          </p>
        )}

        {agents.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="Spend by agent">
            {agents.map(([name, a]) => {
              const pct = totalCostUsd > 0 ? Math.round((a.costUsd / totalCostUsd) * 100) : 0;
              return (
                <li key={name} data-testid="task-spent-agent">
                  <div className="truncate text-xs font-medium text-neutral-700">{name}</div>
                  <div className="flex gap-2 text-xs text-neutral-500">
                    <span className="hidden lg:inline">${a.costUsd.toFixed(4)}</span>
                    <span>{formatDuration(a.durationMs)}</span>
                    <span className="ml-auto">{pct}%</span>
                  </div>
                  <div
                    className="mt-1 hidden h-1.5 rounded bg-neutral-100 lg:block"
                    role="progressbar"
                    aria-label={`${name} share of spend`}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full rounded bg-neutral-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
