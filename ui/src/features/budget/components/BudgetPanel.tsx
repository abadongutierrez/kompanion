import { SectionHeading } from "@/shared/ui/index.js";
import { useTeams } from "@/features/teams/index.js";
import { useProjectSpend } from "../hooks.js";
import { TeamBudgetRow } from "./TeamBudgetRow.js";

// Scoped to the project, not to a team: a project can have several teams,
// and the tab used to show whichever one happened to be first. The total is
// all-time — "what has this project cost me" — while the caps below it stay
// per-team and monthly, because that is what actually refuses a run.
export function BudgetPanel({ projectId }: { projectId: string }) {
  const spend = useProjectSpend(projectId);
  const teams = useTeams(projectId);

  if (!spend.data) return null;

  const byDay = spend.data.byDay;

  return (
    <div className="space-y-2">
      <SectionHeading>Budget</SectionHeading>

      <div className="rounded border border-neutral-200 bg-white px-3 py-2">
        <p className="text-sm text-neutral-800">
          Total spend:{" "}
          <span className="font-medium tabular-nums">
            ${spend.data.totalSpendUsd.toFixed(2)}
          </span>{" "}
          <span className="text-neutral-400">
            across {spend.data.totalRunCount}{" "}
            {spend.data.totalRunCount === 1 ? "run" : "runs"}
          </span>
        </p>
        <p className="text-xs text-neutral-500">
          ${spend.data.monthSpendUsd.toFixed(2)} this month
        </p>
      </div>

      <SectionHeading as="h3" className="pt-2">
        Monthly cap per team
      </SectionHeading>
      <div className="space-y-1">
        {(teams.data ?? []).map((team) => (
          <TeamBudgetRow key={team.id} teamId={team.id} teamName={team.name} />
        ))}
      </div>

      <SectionHeading as="h3" className="pt-2">
        By day this month
      </SectionHeading>
      {byDay.length === 0 ? (
        <p className="text-xs text-neutral-400">No runs yet this month.</p>
      ) : (
        <table className="w-full max-w-md text-xs">
          <tbody>
            {byDay.map((d) => (
              <tr key={d.day} className="border-b border-neutral-100 last:border-0">
                <td className="py-1 text-neutral-600">{d.day}</td>
                <td className="py-1 text-neutral-400">
                  {d.runCount} {d.runCount === 1 ? "run" : "runs"}
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-700">
                  ${d.spendUsd.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
