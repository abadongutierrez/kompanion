import { Router } from "express";
import { Team } from "@kompanion/shared";
import { sql } from "../db/client.js";

export const teamsRouter = Router({ mergeParams: true });

const CreateTeamBody = Team.pick({ name: true });

type ProjectParams = { projectId: string };

teamsRouter.get("/", async (req, res) => {
  const { projectId } = req.params as ProjectParams;
  const teams = await sql`
    select * from teams where project_id = ${projectId} order by created_at
  `;
  res.json(teams);
});

teamsRouter.post("/", async (req, res) => {
  const { projectId } = req.params as ProjectParams;
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const [team] = await sql`
    insert into teams (project_id, name)
    values (${projectId}, ${parsed.data.name})
    returning *
  `;
  res.status(201).json(team);
});
