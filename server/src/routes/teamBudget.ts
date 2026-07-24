import { Router } from "express";
import { UpdateTeamBudgetInput } from "@sdlc/shared";
import { sql } from "../db/client.js";
import { getTeamSpend } from "../runner/budget.js";

export const teamBudgetRouter = Router({ mergeParams: true });

type TeamParams = { teamId: string };

teamBudgetRouter.patch("/budget", async (req, res) => {
  const { teamId } = req.params as TeamParams;
  const parsed = UpdateTeamBudgetInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const [team] = await sql`
    update teams set monthly_budget_usd = ${parsed.data.monthlyBudgetUsd}
    where id = ${teamId}
    returning *
  `;
  if (!team) {
    return res.status(404).json({ error: "team not found" });
  }
  res.json(team);
});

teamBudgetRouter.get("/spend", async (req, res) => {
  const { teamId } = req.params as TeamParams;
  res.json(await getTeamSpend(teamId));
});
