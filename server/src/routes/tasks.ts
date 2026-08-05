import { Router } from "express";
import { z } from "zod";
import {
  Role,
  Task,
  UpdateTaskInput,
  UpdateTaskStatusInput,
  isValidTaskTransition,
} from "@kompanion/shared";
import { sql } from "../db/client.js";
import { runTaskWithClaude } from "../runner/runTask.js";

export const tasksRouter = Router({ mergeParams: true });

const CreateTaskBody = Task.pick({ title: true, type: true }).extend({
  roleId: z.string().nullable().optional(),
  repositoryIds: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  storyPoints: z.number().int().nullable().optional(),
  acceptanceCriteria: z.string().nullable().optional(),
});

const AssignRoleBody = z.object({
  roleId: z.string().nullable(),
});

type TeamParams = { teamId: string };

tasksRouter.get("/", async (req, res) => {
  const { teamId } = req.params as TeamParams;
  const tasks = await sql`
    select
      t.*,
      coalesce(
        array_agg(tr.repository_id) filter (where tr.repository_id is not null),
        '{}'
      ) as repository_ids
    from tasks t
    left join task_repositories tr on tr.task_id = t.id
    where t.team_id = ${teamId}
    group by t.id
    order by t.created_at
  `;
  res.json(tasks);
});

tasksRouter.post("/", async (req, res) => {
  const { teamId } = req.params as TeamParams;
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const {
    title,
    type,
    roleId,
    repositoryIds,
    description,
    storyPoints,
    acceptanceCriteria,
  } = parsed.data;
  const [task] = await sql`
    insert into tasks (team_id, role_id, title, type, description, story_points, acceptance_criteria)
    values (${teamId}, ${roleId ?? null}, ${title}, ${type}, ${description ?? null}, ${storyPoints ?? null}, ${acceptanceCriteria ?? null})
    returning *
  `;

  if (repositoryIds && repositoryIds.length > 0) {
    for (const repositoryId of repositoryIds) {
      await sql`
        insert into task_repositories (task_id, repository_id)
        values (${task.id}, ${repositoryId})
      `;
    }
  }

  res.status(201).json({ ...task, repositoryIds: repositoryIds ?? [] });
});

tasksRouter.patch("/:taskId/status", async (req, res) => {
  const { taskId } = req.params;
  const parsed = UpdateTaskStatusInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [existing] = await sql`select * from tasks where id = ${taskId}`;
  if (!existing) {
    return res.status(404).json({ error: "task not found" });
  }

  if (!isValidTaskTransition(existing.status, parsed.data.status)) {
    return res.status(409).json({
      error: `cannot transition task from ${existing.status} to ${parsed.data.status}`,
    });
  }

  const [task] = await sql`
    update tasks
    set status = ${parsed.data.status}, updated_at = now()
    where id = ${taskId}
    returning *
  `;
  res.json(task);
});

tasksRouter.patch("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const parsed = UpdateTaskInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { title, type, description, storyPoints, acceptanceCriteria } = parsed.data;

  const [task] = await sql`
    update tasks
    set
      title = coalesce(${title ?? null}, title),
      type = coalesce(${type ?? null}, type),
      description = ${description === undefined ? sql`description` : description},
      story_points = ${storyPoints === undefined ? sql`story_points` : storyPoints},
      acceptance_criteria = ${
        acceptanceCriteria === undefined ? sql`acceptance_criteria` : acceptanceCriteria
      },
      updated_at = now()
    where id = ${taskId}
    returning *
  `;
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }
  res.json(task);
});

tasksRouter.delete("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  // Cascades to task_runs, task_repositories, and task_dependencies (both
  // directions) — nothing is left orphaned in the DB. What's deliberately
  // NOT cleaned up: any on-disk scratch workspace or git worktree this task
  // used, same as the existing "worktree lifecycle" open question — deleting
  // the Task doesn't try to reclaim disk space or prune git branches.
  const [task] = await sql`delete from tasks where id = ${taskId} returning id`;
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }
  res.status(204).send();
});

tasksRouter.post("/:taskId/repositories", async (req, res) => {
  const { taskId } = req.params;
  const parsed = z.object({ repositoryId: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  await sql`
    insert into task_repositories (task_id, repository_id)
    values (${taskId}, ${parsed.data.repositoryId})
    on conflict do nothing
  `;
  res.status(204).send();
});

tasksRouter.delete("/:taskId/repositories/:repositoryId", async (req, res) => {
  const { taskId, repositoryId } = req.params;
  await sql`
    delete from task_repositories
    where task_id = ${taskId} and repository_id = ${repositoryId}
  `;
  res.status(204).send();
});

tasksRouter.patch("/:taskId/role", async (req, res) => {
  const { taskId } = req.params;
  const parsed = AssignRoleBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const [task] = await sql`
    update tasks
    set role_id = ${parsed.data.roleId}, updated_at = now()
    where id = ${taskId}
    returning *
  `;
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }
  res.json(task);
});

tasksRouter.post("/:taskId/run", async (req, res) => {
  const { taskId } = req.params;

  const [task] = await sql`select * from tasks where id = ${taskId}`;
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }
  if (!task.roleId) {
    return res.status(400).json({ error: "task has no role assigned" });
  }

  const [role] = await sql`select * from roles where id = ${task.roleId}`;
  if (!role) {
    return res.status(400).json({ error: "assigned role not found" });
  }

  try {
    const run = await runTaskWithClaude(
      task as unknown as Task,
      role as unknown as Role,
    );
    res.status(201).json(run);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "NO_HARNESS") {
      return res
        .status(400)
        .json({ error: `no harness directory found at role's harnessPath "${role.harnessPath}"` });
    }
    if (code === "OVER_BUDGET") {
      // Still a 201: a task_runs record was created (status "over_budget"),
      // just refused before spending anything — model it as a run outcome,
      // not an HTTP error, so the client renders it the same way as any
      // other run result instead of needing special-case error handling.
      return res.status(201).json((err as { run: unknown }).run);
    }
    // Anything else (e.g. a worktree/git failure) is a real bug or bad repo
    // state, not one of the two known refusal paths above — surface it as a
    // clean JSON error rather than letting it fall through to Express's
    // default HTML error page, which the client can't parse or display.
    console.error("task run failed:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "run failed",
    });
  }
});

tasksRouter.get("/:taskId/runs", async (req, res) => {
  const { taskId } = req.params;
  const runs = await sql`
    select * from task_runs where task_id = ${taskId} order by created_at desc
  `;
  res.json(runs);
});
