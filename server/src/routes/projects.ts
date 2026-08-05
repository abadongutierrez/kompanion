import { Router } from "express";
import { CreateProjectInput } from "@kompanion/shared";
import { sql } from "../db/client.js";

export const projectsRouter = Router();

projectsRouter.get("/", async (_req, res) => {
  const projects = await sql`select * from projects order by created_at`;
  res.json(projects);
});

projectsRouter.post("/", async (req, res) => {
  const parsed = CreateProjectInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const [project] = await sql`
    insert into projects (name) values (${parsed.data.name}) returning *
  `;
  res.status(201).json(project);
});
