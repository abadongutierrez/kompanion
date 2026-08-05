import { Router } from "express";
import { CreateTaskDependencyInput } from "@kompanion/shared";
import { sql } from "../db/client.js";

export const taskDependenciesRouter = Router({ mergeParams: true });

type TaskParams = { taskId: string };

taskDependenciesRouter.get("/", async (req, res) => {
  const { taskId } = req.params as TaskParams;
  const deps = await sql`
    select d.*, t.title as related_task_title
    from task_dependencies d
    join tasks t on t.id = d.related_task_id
    where d.task_id = ${taskId}
    order by d.created_at
  `;
  res.json(deps);
});

taskDependenciesRouter.post("/", async (req, res) => {
  const { taskId } = req.params as TaskParams;
  const parsed = CreateTaskDependencyInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { relatedTaskId, type } = parsed.data;

  if (relatedTaskId === taskId) {
    return res.status(400).json({ error: "a task cannot depend on itself" });
  }

  const [dep] = await sql`
    insert into task_dependencies (task_id, related_task_id, type)
    values (${taskId}, ${relatedTaskId}, ${type})
    on conflict (task_id, related_task_id, type) do nothing
    returning *
  `;
  if (!dep) {
    return res.status(409).json({ error: "this dependency already exists" });
  }

  const [related] = await sql`select title from tasks where id = ${relatedTaskId}`;
  res.status(201).json({ ...dep, relatedTaskTitle: related?.title ?? null });
});

taskDependenciesRouter.delete("/:dependencyId", async (req, res) => {
  const { dependencyId } = req.params;
  const [dep] = await sql`
    delete from task_dependencies where id = ${dependencyId} returning *
  `;
  if (!dep) {
    return res.status(404).json({ error: "dependency not found" });
  }
  res.status(204).send();
});
