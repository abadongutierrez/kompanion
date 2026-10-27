import type { TaskRun } from "@kompanion/shared";

// Right-hand column of the task page. For now it only shows what the task
// has cost so far; more sections can stack under it.
export function TaskSidebar({ runs }: { runs: TaskRun[] | undefined }) {
  // A run that is still in flight has a null cost and counts as 0 until it
  // finishes, same as the board card's total.
  const totalCostUsd = (runs ?? []).reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const runCount = runs?.length ?? 0;

  return (
    <aside
      aria-label="Task details"
      className="w-56 shrink-0 space-y-4 self-start rounded border border-neutral-200 p-3"
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
      </section>
    </aside>
  );
}
