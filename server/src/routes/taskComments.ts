import { Router } from "express";
import { CreateTaskCommentInput, Role, Task } from "@sdlc/shared";
import { sql } from "../db/client.js";
import { runTaskWithClaude } from "../runner/runTask.js";

export const taskCommentsRouter = Router({ mergeParams: true });

type Params = { teamId: string; taskId: string };

const MENTION_PATTERN = /@([a-z0-9-]+)/g;

function extractMentionedSlugs(body: string): string[] {
  const slugs = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    slugs.add(match[1]);
  }
  return [...slugs];
}

async function resolveMentions(teamId: string, body: string) {
  const slugs = extractMentionedSlugs(body);
  if (slugs.length === 0) return [];
  const roles = await sql`
    select id, title, slug from roles where team_id = ${teamId} and slug in ${sql(slugs)}
  `;
  return roles.map((r) => ({ id: r.id, title: r.title, slug: r.slug }));
}

async function shapeComment(teamId: string, row: Record<string, unknown>) {
  const mentionedRoles = await resolveMentions(teamId, row.body as string);
  return {
    id: row.id,
    taskId: row.taskId,
    roleId: row.roleId,
    authorTitle: row.authorTitle ?? null,
    body: row.body,
    mentionedRoles,
    createdAt: row.createdAt,
  };
}

taskCommentsRouter.get("/", async (req, res) => {
  const { teamId, taskId } = req.params as Params;
  const rows = await sql`
    select c.*, r.title as author_title
    from task_comments c
    left join roles r on r.id = c.role_id
    where c.task_id = ${taskId}
    order by c.created_at
  `;
  const comments = await Promise.all(rows.map((row) => shapeComment(teamId, row)));
  res.json(comments);
});

taskCommentsRouter.post("/", async (req, res) => {
  const { teamId, taskId } = req.params as Params;
  const parsed = CreateTaskCommentInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { roleId, body } = parsed.data;

  const [row] = await sql`
    insert into task_comments (task_id, role_id, body)
    values (${taskId}, ${roleId ?? null}, ${body})
    returning *
  `;
  const [author] = roleId
    ? await sql`select title from roles where id = ${roleId}`
    : [null];
  res.status(201).json(
    await shapeComment(teamId, { ...row, authorTitle: author?.title ?? null }),
  );
});

// Backfills a comment from the Task's first-ever run (whichever Role that
// was, not necessarily who's currently assigned) the first time anyone
// replies via a mention — so a reader following a later exchange (e.g. QA's
// reply to an @mention) sees what the original agent actually did, not just
// the latest reply, without needing to dig through run history separately.
// Idempotent: skips if that exact summary is already posted as a comment.
async function ensureOriginalSummaryComment(taskId: string): Promise<void> {
  const [firstRun] = await sql`
    select * from task_runs
    where task_id = ${taskId} and status != 'running' and summary is not null
    order by created_at asc
    limit 1
  `;
  if (!firstRun) return;

  const [existing] = await sql`
    select 1 from task_comments
    where task_id = ${taskId} and role_id = ${firstRun.roleId} and body = ${firstRun.summary}
    limit 1
  `;
  if (existing) return;

  await sql`
    insert into task_comments (task_id, role_id, body)
    values (${taskId}, ${firstRun.roleId}, ${firstRun.summary})
  `;
}

// Manual trigger: an operator (or, later, an automated wake) decides a
// mentioned role should actually run against this task. Reuses the exact
// same runTaskWithClaude path as the assignee's "Run with Claude" button —
// same budget check, same harness/workspace resolution — just for whichever
// role is named here instead of the task's current assignee. The run's
// outcome is posted back as a new comment authored by that role, so the
// thread reads as a real reply rather than a one-way ping.
taskCommentsRouter.post("/:commentId/reply-as/:roleId", async (req, res) => {
  const { teamId, taskId, commentId, roleId } = req.params as Params & {
    commentId: string;
    roleId: string;
  };

  const [comment] = await sql`
    select c.*, r.title as author_title
    from task_comments c
    left join roles r on r.id = c.role_id
    where c.id = ${commentId} and c.task_id = ${taskId}
  `;
  if (!comment) {
    return res.status(404).json({ error: "comment not found" });
  }

  const [task] = await sql`select * from tasks where id = ${taskId}`;
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }

  const [role] = await sql`
    select * from roles where id = ${roleId} and team_id = ${teamId}
  `;
  if (!role) {
    return res.status(404).json({ error: "role not found on this team" });
  }

  const mentionAuthor = comment.authorTitle ?? "Operator";
  const mentionContext = `You were mentioned by ${mentionAuthor} in a comment: "${comment.body}"`;

  await ensureOriginalSummaryComment(taskId);

  try {
    const run = await runTaskWithClaude(
      task as unknown as Task,
      role as unknown as Role,
      { mentionContext },
    );
    const replyBody =
      run.summary ?? `(${run.status}, no summary returned)`;
    const [replyRow] = await sql`
      insert into task_comments (task_id, role_id, body)
      values (${taskId}, ${role.id}, ${replyBody})
      returning *
    `;
    res.status(201).json(
      await shapeComment(teamId, { ...replyRow, authorTitle: role.title }),
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    let replyBody: string | null = null;
    if (code === "NO_HARNESS") {
      replyBody = `Couldn't run — no harness directory found at role's harnessPath "${role.harnessPath}".`;
    } else if (code === "OVER_BUDGET") {
      replyBody = `Couldn't run — the team is over its monthly budget.`;
    } else {
      throw err;
    }
    const [replyRow] = await sql`
      insert into task_comments (task_id, role_id, body)
      values (${taskId}, ${role.id}, ${replyBody})
      returning *
    `;
    res.status(201).json(
      await shapeComment(teamId, { ...replyRow, authorTitle: role.title }),
    );
  }
});
