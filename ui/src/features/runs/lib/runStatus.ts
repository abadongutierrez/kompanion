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

// Everything the model had to read: fresh input plus both cache figures.
// Claude Code's `input_tokens` alone is only the uncached remainder — real
// runs here show a few dozen against hundreds of thousands read from cache —
// so showing that field as "input" would understate a run by four orders of
// magnitude.
export function totalInputTokens(run: TaskRun): number | null {
  const parts = [run.inputTokens, run.cacheReadTokens, run.cacheWriteTokens];
  if (parts.every((p) => p == null)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
}

// Compact enough to sit in a one-line run header: 1.5M, 15.0k, 940.
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
