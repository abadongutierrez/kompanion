import type { TaskRun } from "@kompanion/shared";

// Shared by the board card's Runs section and the task page's transcript
// header, so a run reads the same in both places.
export const RUN_STATUS_ICON: Record<TaskRun["status"], string> = {
  running: "⏳",
  succeeded: "✅",
  failed: "❌",
  over_budget: "💸",
};

// A run that never reached a terminal state has no cost recorded — the CLI's
// result line, which carries total_cost_usd, only arrives if the process
// finished. Showing "$0.0000" for those would read as "this was free" rather
// than "we never found out".
export function formatRunCost(costUsd: number | null): string {
  return costUsd == null ? "cost unknown" : `$${costUsd.toFixed(4)}`;
}
