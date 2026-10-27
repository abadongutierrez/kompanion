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
// A finished run can still have a null cost when the CLI exited without
// reporting one. Those runs are never treated as free: the total and the
// affected Agent rows get a trailing "+" (the figure is a lower bound) and a
// note says how many runs it leaves out; when nothing at all is known the
// figure reads "Unknown" rather than $0. Percentages need the whole total, so
// any unknown cost turns every Agent's share into "—".
//
// Below the lg breakpoint each Agent row drops its cost and progress bar and
// keeps only its time and percentage. Below md the sidebar stacks under the
// task column instead of squeezing it, capped in height (scrolling inside) so
// a long Agent list can't crowd the runs out of the page's fixed height.
export function TaskSidebar({
  runs,
  isError = false,
}: {
  runs: TaskRun[] | undefined;
  isError?: boolean;
}) {
  return (
    <aside
      aria-label="Task details"
      className="max-h-40 w-full shrink-0 space-y-4 overflow-y-auto rounded border border-neutral-200 p-3 md:max-h-none md:w-36 md:self-start md:overflow-visible lg:w-56"
    >
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Spent so far
        </h3>
        {/* Until the runs arrive there is nothing to sum — showing $0 here
            would read as "never run" for a task that has paid runs. */}
        {runs ? (
          <Spend runs={runs} />
        ) : (
          <p className="mt-1 text-xs text-neutral-400" data-testid="task-spent-status">
            {isError ? "Spend unavailable" : "Loading…"}
          </p>
        )}
      </section>
    </aside>
  );
}

function money(costUsd: number, known: number, unknown: number): string {
  if (known === 0 && unknown > 0) return "Unknown";
  return `$${costUsd.toFixed(4)}${unknown > 0 ? "+" : ""}`;
}

function Spend({ runs }: { runs: TaskRun[] }) {
  const finished = runs.filter((r) => r.status !== "running");
  const runningCount = runs.length - finished.length;
  const runCount = finished.length;

  let totalCostUsd = 0;
  let unknownCount = 0;
  const byAgent = new Map<
    string,
    { costUsd: number; durationMs: number; known: number; unknown: number }
  >();
  for (const r of finished) {
    const name = r.agentTitle ?? "Unknown agent";
    const row = byAgent.get(name) ?? { costUsd: 0, durationMs: 0, known: 0, unknown: 0 };
    if (r.costUsd == null) {
      row.unknown += 1;
      unknownCount += 1;
    } else {
      row.costUsd += r.costUsd;
      row.known += 1;
      totalCostUsd += r.costUsd;
    }
    row.durationMs += r.durationMs ?? 0;
    byAgent.set(name, row);
  }
  const agents = [...byAgent.entries()].sort((a, b) => b[1].costUsd - a[1].costUsd);

  return (
    <>
      <p className="mt-1 text-lg font-medium" data-testid="task-spent">
        {money(totalCostUsd, runCount - unknownCount, unknownCount)}
      </p>
      <p className="text-xs text-neutral-400">
        {runCount === 0 ? "Not run yet" : `across ${runCount} run${runCount === 1 ? "" : "s"}`}
      </p>
      {unknownCount > 0 && (
        <p className="text-xs text-amber-600">
          {unknownCount} run{unknownCount === 1 ? "" : "s"} with unknown cost
        </p>
      )}
      {runningCount > 0 && (
        <p className="text-xs text-neutral-400">
          {runningCount} running, not counted
        </p>
      )}

      {agents.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Spend by agent">
          {agents.map(([name, a]) => {
            // One unknown cost anywhere makes the denominator unknown, so
            // no Agent's share can be stated: every row gets "—" and an
            // empty bar rather than a share of the known part only.
            const pct =
              unknownCount > 0
                ? null
                : totalCostUsd > 0
                  ? Math.round((a.costUsd / totalCostUsd) * 100)
                  : 0;
            return (
              <li key={name} data-testid="task-spent-agent">
                <div className="truncate text-xs font-medium text-neutral-700">{name}</div>
                <div className="flex gap-2 text-xs text-neutral-500">
                  <span className="hidden lg:inline">{money(a.costUsd, a.known, a.unknown)}</span>
                  <span>{formatDuration(a.durationMs)}</span>
                  <span className="ml-auto">{pct === null ? "—" : `${pct}%`}</span>
                </div>
                <div
                  className="mt-1 hidden h-1.5 rounded bg-neutral-100 lg:block"
                  role="progressbar"
                  aria-label={`${name} share of spend`}
                  aria-valuenow={pct ?? undefined}
                  aria-valuetext={pct === null ? "unknown" : undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded bg-neutral-500" style={{ width: `${pct ?? 0}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
