import { NavLink } from "react-router-dom";
import { SpentByRuntimeCard } from "@/features/budget/index.js";
import { ClaudeUsageCard } from "@/features/system/index.js";
import { useActiveRuns } from "@/features/runs/index.js";

export type Section = "board" | "runs" | "agents" | "repositories" | "budget";

const NAV_ITEMS: { section: Section; label: string }[] = [
  { section: "board", label: "Board" },
  { section: "runs", label: "Runs" },
  { section: "agents", label: "Agents" },
  { section: "repositories", label: "Repositories" },
  { section: "budget", label: "Budget" },
];

export function Sidebar({ projectId }: { projectId: string }) {
  // Same query the Runs tab polls, so the count costs no extra request.
  const activeRuns = useActiveRuns(projectId);
  const runningCount = activeRuns.data?.length ?? 0;

  return (
    <nav className="w-40 shrink-0 space-y-4 border-r border-neutral-200 bg-white p-3">
      <div className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.section}
            to={`/projects/${projectId}/${item.section}`}
            className={({ isActive }) =>
              `block w-full rounded px-3 py-2 text-left text-sm ${
                isActive
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`
            }
          >
            {item.label}
            {item.section === "runs" && runningCount > 0 && (
              <span
                className="ml-2 rounded-full bg-neutral-200 px-1.5 text-xs tabular-nums text-neutral-800"
                aria-label={`${runningCount} active`}
              >
                {runningCount}
              </span>
            )}
          </NavLink>
        ))}
      </div>
      <SpentByRuntimeCard projectId={projectId} />
      <ClaudeUsageCard />
    </nav>
  );
}
