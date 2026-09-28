import { useState } from "react";
import { useTeamSpend, useUpdateTeamBudget } from "../hooks.js";

// The month-to-date figure and the cap that gates runs, both per team —
// unchanged behaviour, just one row per team now instead of one panel for
// whichever team came first.
//
// The field and button here are deliberately not the shared primitives: this
// row runs at a third, tighter density (px-1.5 py-0.5) that exists nowhere
// else, and adding it to the primitives to serve one caller would make them
// worse.
export function TeamBudgetRow({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const [draft, setDraft] = useState("");
  const spend = useTeamSpend(teamId);
  const updateBudget = useUpdateTeamBudget(teamId);

  if (!spend.data) return null;

  const overBudget =
    spend.data.monthlyBudgetUsd != null &&
    spend.data.spendUsd >= spend.data.monthlyBudgetUsd;

  return (
    <div className="flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
      <span className="font-medium text-neutral-700">{teamName}</span>
      <span className={overBudget ? "font-medium text-red-600" : ""}>
        ${spend.data.spendUsd.toFixed(2)} this month
        {spend.data.monthlyBudgetUsd != null &&
          ` / $${spend.data.monthlyBudgetUsd.toFixed(2)} budget`}
        {overBudget && " — over budget, runs are refused"}
      </span>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          updateBudget.mutate(draft.trim() === "" ? null : Number(draft), {
            onSuccess: () => setDraft(""),
          });
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
  );
}
