import type { UsageWindow } from "@kompanion/shared";
import { useClaudeUsage } from "../hooks.js";

// How much of the Claude subscription window is left, so the operator knows
// before starting runs whether Claude Code agents will hit a limit. Per
// machine/account, not per project — hence a card under the nav, not a
// section. Hidden entirely when the server can't tell (API-key setup, no
// credentials, endpoint down) — that's the normal state for most setups, not
// an error worth sidebar space. The reason is in the /api/claude/usage payload.
export function ClaudeUsageCard() {
  const usage = useClaudeUsage();

  if (!usage.data?.available || usage.data.windows.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-neutral-200 pt-3">
      <p className="px-1 text-xs font-medium text-neutral-500">Claude usage</p>
      {usage.data.windows.map((w) => (
        <UsageBar key={w.kind} window={w} />
      ))}
    </div>
  );
}

function UsageBar({ window: w }: { window: UsageWindow }) {
  const pct = w.utilization == null ? null : Math.min(100, Math.max(0, w.utilization));
  const rejected = w.status === "rejected";
  // Neutral under 70%, amber 70–90%, red over 90%. A run's status outranks
  // the percent, which may be stale or missing.
  const tone =
    rejected || (pct ?? 0) > 90
      ? "red"
      : (pct ?? 0) >= 70 || w.status === "allowed_warning"
        ? "amber"
        : "neutral";

  return (
    <div className="px-1" title={w.resetsAt ? `Resets ${new Date(w.resetsAt).toLocaleString()}` : undefined}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-neutral-600">{windowLabel(w.kind)}</span>
        <span className={TEXT[tone]}>{rejected ? "limit" : pct == null ? "—" : `${Math.round(pct)}%`}</span>
      </div>
      <div className="mt-0.5 h-1 w-full rounded bg-neutral-100">
        <div className={`h-1 rounded ${BAR[tone]}`} style={{ width: `${rejected ? 100 : pct ?? 0}%` }} />
      </div>
      {w.resetsAt && <p className="text-[10px] text-neutral-400">resets {resetLabel(w.resetsAt)}</p>}
    </div>
  );
}

const TEXT = { neutral: "text-neutral-500", amber: "text-amber-600", red: "text-red-600" } as const;
const BAR = { neutral: "bg-neutral-400", amber: "bg-amber-500", red: "bg-red-500" } as const;

// "five_hour" -> "5h", "seven_day" -> "7d", "seven_day_opus" -> "7d opus".
// Anything unrecognized is shown as sent, underscores spaced.
function windowLabel(kind: string): string {
  if (kind === "five_hour") return "5h";
  if (kind === "seven_day") return "7d";
  if (kind.startsWith("seven_day_")) return `7d ${kind.slice("seven_day_".length).replace(/_/g, " ")}`;
  return kind.replace(/_/g, " ");
}

// Time of day when it's within a day, else a short date — the sidebar is
// w-40 and has no room for both.
function resetLabel(iso: string): string {
  const at = new Date(iso);
  const soon = at.getTime() - Date.now() < 24 * 60 * 60 * 1000;
  return soon
    ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : at.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
