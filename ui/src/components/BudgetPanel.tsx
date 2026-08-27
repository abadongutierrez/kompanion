import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";

export function BudgetPanel({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const spend = useQuery({
    queryKey: ["teamSpend", teamId],
    queryFn: () => api.getTeamSpend(teamId),
  });

  const daily = useQuery({
    queryKey: ["teamDailySpend", teamId],
    queryFn: () => api.getTeamDailySpend(teamId),
  });

  const updateBudget = useMutation({
    mutationFn: (monthlyBudgetUsd: number | null) =>
      api.updateTeamBudget(teamId, { monthlyBudgetUsd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamSpend", teamId] });
      queryClient.invalidateQueries({ queryKey: ["teamDailySpend", teamId] });
      setDraft("");
    },
  });

  if (!spend.data) return null;

  const overBudget =
    spend.data.monthlyBudgetUsd != null &&
    spend.data.spendUsd >= spend.data.monthlyBudgetUsd;

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase text-neutral-500">Budget</h2>
      <div className="flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
        <span className={overBudget ? "font-medium text-red-600" : ""}>
          Spend this month: ${spend.data.spendUsd.toFixed(2)}
          {spend.data.monthlyBudgetUsd != null &&
            ` / $${spend.data.monthlyBudgetUsd.toFixed(2)} budget`}
          {overBudget && " — over budget, runs are refused"}
        </span>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            updateBudget.mutate(draft.trim() === "" ? null : Number(draft));
          }}
        >
          <input
            className="w-20 rounded border border-neutral-300 px-1.5 py-0.5"
            placeholder={
              spend.data.monthlyBudgetUsd != null
                ? String(spend.data.monthlyBudgetUsd)
                : "no limit"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100"
            disabled={updateBudget.isPending}
          >
            Set budget
          </button>
        </form>
      </div>

      <h3 className="pt-2 text-xs font-semibold uppercase text-neutral-500">
        By day this month
      </h3>
      {daily.data && daily.data.length === 0 ? (
        <p className="text-xs text-neutral-400">No runs yet this month.</p>
      ) : (
        <table className="w-full max-w-md text-xs">
          <tbody>
            {(daily.data ?? []).map((d) => (
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
