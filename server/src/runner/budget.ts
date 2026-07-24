import { sql } from "../db/client.js";

export type TeamSpendRow = {
  teamId: string;
  monthlyBudgetUsd: number | null;
  spendUsd: number;
  periodStart: string;
};

// Spend resets on calendar-month boundaries. "Current spend" is the sum of
// task_runs.cost_usd for runs against this team's tasks since the start of
// the current month — cost is only ever recorded for runs that actually
// invoked Claude, so over_budget refusals never count against themselves.
export async function getTeamSpend(teamId: string): Promise<TeamSpendRow> {
  const [team] = await sql`select * from teams where id = ${teamId}`;
  const [row] = await sql`
    select
      date_trunc('month', now()) as period_start,
      coalesce(sum(tr.cost_usd), 0) as spend_usd
    from task_runs tr
    join tasks t on t.id = tr.task_id
    where t.team_id = ${teamId}
      and tr.created_at >= date_trunc('month', now())
  `;

  return {
    teamId,
    monthlyBudgetUsd: team?.monthlyBudgetUsd ?? null,
    spendUsd: Number(row.spendUsd),
    periodStart: new Date(row.periodStart).toISOString(),
  };
}

export async function isOverBudget(teamId: string): Promise<boolean> {
  const spend = await getTeamSpend(teamId);
  if (spend.monthlyBudgetUsd == null) return false;
  return spend.spendUsd >= spend.monthlyBudgetUsd;
}
