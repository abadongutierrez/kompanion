import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Repository, Role, Task, TaskStatus } from "@kompanion/shared";
import { isValidTaskTransition } from "@kompanion/shared";
import { sql } from "../db/client.js";
import { resolveHarnessDir, resolveWorkspaceDir } from "./claudeHarness.js";
import { getTeamSpend } from "./budget.js";
import { ensureWorktrees, taskBranchName } from "./repoWorkspace.js";
import { publishRunEnd, publishRunEvent } from "./runEvents.js";
import { installCwdEnforcement, type WorkspaceManifest } from "./workspaceEnforcement.js";

const RUN_TIMEOUT_MS = 180_000;

function buildPrompt(
  task: Task,
  manifest: WorkspaceManifest,
  teamSnapshot: string | null,
  mentionContext: string | null,
): string {
  const workspaceLine = manifest.primary.repositoryLocalPath
    ? manifest.otherRepos.length > 0
      ? `Workspace: this directory is a real git repository ('${manifest.primary.name}', branch ${manifest.branchName}) — implement/verify/refine as real code, right here, and commit your changes with a clear message. ${manifest.otherRepos.length} other linked repositor${manifest.otherRepos.length === 1 ? "y is" : "ies are"} also on the same branch, at these absolute paths — pass that path as --folder to exec_in_folder.py if the change touches them too, and commit separately in each: ${manifest.otherRepos.map((r) => `${r.name} (${r.workspaceLocalPath})`).join(", ")}. A manifest.json in this directory also records these paths and the branch name if you need to double-check.`
      : `Workspace: this directory is a real git repository (branch ${manifest.branchName}) — implement/verify/refine as real code, right here, and commit your changes with a clear message. A manifest.json in this directory records the branch name and repo path if you need to double-check.`
    : `Workspace: scratch (no repository linked) — use the solution.md/notes.md convention from your skill.`;

  const lines = [
    `Task ID: ${task.id}`,
    `Task: ${task.title}`,
    `Type: ${task.type}`,
    task.description ? `Description: ${task.description}` : null,
    task.acceptanceCriteria
      ? `Acceptance criteria: ${task.acceptanceCriteria}`
      : null,
    workspaceLine,
    teamSnapshot,
    mentionContext,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

// Every other Role only ever sees the one Task it was handed. Project
// Manager (identified by slug, the only stable identifier a Role has) is
// structurally different — capacity/parallelization reasoning requires
// seeing the whole team at once — so this is the one place a team-wide
// query crosses into a single Task's prompt, deliberately scoped to just
// this one Role rather than generalizing prompt-building early.
async function buildTeamSnapshot(teamId: string): Promise<string> {
  const roles = await sql`
    select r.* from roles r
    join team_roles tr on tr.role_id = r.id
    where tr.team_id = ${teamId}
  `;
  const activeCounts = await sql`
    select role_id, count(*)::int as active_count
    from tasks
    where team_id = ${teamId} and status = 'in_progress' and role_id is not null
    group by role_id
  `;
  const activeCountByRole = new Map(
    activeCounts.map((r) => [r.roleId as string, r.activeCount as number]),
  );

  const tasks = await sql`
    select
      t.title, t.type, t.status,
      r.title as role_title,
      blocker.title as blocker_title
    from tasks t
    left join roles r on r.id = t.role_id
    left join task_dependencies dep on dep.task_id = t.id and dep.type = 'blocked_by'
    left join tasks blocker on blocker.id = dep.related_task_id
    where t.team_id = ${teamId}
    order by t.created_at
  `;

  const roleLines = roles.map((r) => {
    const count = activeCountByRole.get(r.id as string) ?? 0;
    return `- ${r.title}: ${count} active task${count === 1 ? "" : "s"}`;
  });

  const taskLines = tasks.map((t) => {
    const roleLabel = t.roleTitle ?? "Unassigned";
    const blockerLabel = t.blockerTitle ? `"${t.blockerTitle}"` : "none";
    return `- [${t.status}] "${t.title}" (${t.type}) — ${roleLabel} — blocked by: ${blockerLabel}`;
  });

  return [
    "Team snapshot:",
    "Roles:",
    ...(roleLines.length ? roleLines : ["(none)"]),
    "Tasks:",
    ...(taskLines.length ? taskLines : ["(none)"]),
  ].join("\n");
}

// Materializes the assigned role's .claude/ (skills/agents/hook settings)
// into the task's workspace, replacing any previous role's config wholesale
// (so skills/agents don't accumulate across roles) but leaving everything
// else — prior roles' output files, activity.log — intact, so the workspace
// still accumulates a real history as a Task moves role to role.
//
// CLAUDE.md is deliberately NOT copied here (see readRoleSystemPrompt) —
// when workspaceDir is a real repo's worktree, overwriting a file at that
// path could clobber a real CLAUDE.md the target project already has, and
// a later `git add -A`/`git commit -a` would bake that clobber into the
// repo's actual history.
function copyHarnessSkills(workspaceDir: string, harnessDir: string): void {
  mkdirSync(workspaceDir, { recursive: true });
  rmSync(join(workspaceDir, ".claude"), { recursive: true, force: true });
  cpSync(join(harnessDir, ".claude"), join(workspaceDir, ".claude"), {
    recursive: true,
  });
}

// Read once and passed via --append-system-prompt instead of being copied
// as a file — works identically regardless of what cwd is, and can never
// clobber a real project's own CLAUDE.md.
function readRoleSystemPrompt(harnessDir: string): string | null {
  const claudeMdSrc = join(harnessDir, "CLAUDE.md");
  return existsSync(claudeMdSrc) ? readFileSync(claudeMdSrc, "utf8") : null;
}

type ClaudeResult = {
  ok: boolean;
  summary: string | null;
  rawOutput: unknown;
  costUsd: number | null;
  durationMs: number;
};

// Claude Code's --output-format json/stream-json result line includes
// total_cost_usd at the top level — snake_case, confirmed against the
// actual raw stdout (not the misleadingly-camelCased copy postgres.js
// hands back after a DB round-trip via its camelCase transform, which is
// what earlier inspection was reading).
function extractCostUsd(rawOutput: unknown): number | null {
  if (
    rawOutput &&
    typeof rawOutput === "object" &&
    "total_cost_usd" in rawOutput &&
    typeof (rawOutput as { total_cost_usd: unknown }).total_cost_usd ===
      "number"
  ) {
    return (rawOutput as { total_cost_usd: number }).total_cost_usd;
  }
  return null;
}

// Streams `claude --output-format stream-json --include-partial-messages`:
// every complete JSON line is persisted to task_run_events (for replay) and
// published live to any open SSE connections (runEvents.ts) as it arrives.
// The final `result`-type line carries the same fields the old buffered
// `--output-format json` mode did, so cost/summary extraction is unchanged
// — just sourced from one JSONL line instead of the whole stdout blob.
function runClaudeStreaming(
  prompt: string,
  cwd: string,
  runId: string,
  systemPromptAppend: string | null,
  taskWorkspaceDir: string,
  taskId: string,
): Promise<ClaudeResult> {
  return new Promise((resolve) => {
    const bin = process.env.CLAUDE_BIN ?? "claude";
    const started = Date.now();
    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--dangerously-skip-permissions",
    ];
    if (systemPromptAppend) {
      args.push("--append-system-prompt", systemPromptAppend);
    }
    // TASK_WORKSPACE_DIR is where the harness's own Stop hook writes
    // activity.log and where the PreToolUse enforcement hook reads
    // manifest.json from — deliberately separate from cwd (the real repo
    // being worked on) once repos are linked, so our app's own metadata
    // about the run never lands inside the actual repository. Confirmed
    // live that hook subprocesses inherit this env var.
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, TASK_WORKSPACE_DIR: taskWorkspaceDir, TASK_ID: taskId },
    });

    let buffer = "";
    let stderr = "";
    let seq = 0;
    let finalResult: Record<string, unknown> | null = null;
    const pendingInserts: Promise<unknown>[] = [];

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, RUN_TIMEOUT_MS);

    function handleLine(line: string) {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return; // stray non-JSON stdout noise — nothing to persist/relay
      }
      const currentSeq = seq++;
      // Stored as the original raw JSON text (not re-serialized, not
      // sql.json()) — see the migration's comment on why: sql.json() would
      // route through the client's camelCase-transforming JSONB path.
      pendingInserts.push(
        sql`
          insert into task_run_events (run_id, seq, payload)
          values (${runId}, ${currentSeq}, ${trimmed})
        `,
      );
      publishRunEvent(runId, currentSeq, parsed);
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { type?: unknown }).type === "result"
      ) {
        finalResult = parsed as Record<string, unknown>;
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    // Deliberately does NOT call publishRunEnd here — that must only happen
    // once the caller has written the run's terminal status to task_runs,
    // otherwise a subscriber could see status "running" and then get no end
    // signal, ever (the real race this was built to avoid).
    async function finish(result: ClaudeResult) {
      clearTimeout(timer);
      await Promise.all(pendingInserts);
      resolve(result);
    }

    child.on("error", (err) => {
      void finish({
        ok: false,
        summary: `Failed to launch Claude Code: ${err.message}`,
        rawOutput: { error: err.message, stderr },
        costUsd: null,
        durationMs: Date.now() - started,
      });
    });

    child.on("close", (code) => {
      if (buffer.trim()) handleLine(buffer);
      const durationMs = Date.now() - started;

      if (finalResult) {
        const summary =
          typeof finalResult.result === "string" ? finalResult.result : null;
        void finish({
          ok: finalResult.subtype === "success",
          summary,
          rawOutput: finalResult,
          costUsd: extractCostUsd(finalResult),
          durationMs,
        });
        return;
      }

      void finish({
        ok: false,
        summary:
          stderr.trim() ||
          (code !== 0
            ? `claude exited with code ${code}`
            : "claude ended without a result"),
        rawOutput: { exitCode: code, stderr },
        costUsd: null,
        durationMs,
      });
    });
  });
}

async function transitionTaskStatus(
  taskId: string,
  from: TaskStatus,
  to: TaskStatus,
): Promise<TaskStatus> {
  if (!isValidTaskTransition(from, to)) return from;
  await sql`
    update tasks set status = ${to}, updated_at = now() where id = ${taskId}
  `;
  return to;
}

export async function runTaskWithClaude(
  task: Task,
  role: Role,
  options?: { mentionContext?: string | null },
) {
  const mentionContext = options?.mentionContext ?? null;
  const harnessDir = resolveHarnessDir(role);
  if (!harnessDir) {
    const error = new Error("no harness for this role") as Error & {
      code: string;
    };
    error.code = "NO_HARNESS";
    throw error;
  }

  // Checked before spending anything: once a team is over its monthly budget,
  // refuse the run outright rather than burning more cost on top of an
  // overspend. Recorded as its own task_runs row (status "over_budget", no
  // cost, task status untouched) so it shows up in the audit trail same as
  // any other run outcome, not just a silent 4xx.
  const spend = await getTeamSpend(task.teamId);
  if (spend.monthlyBudgetUsd != null && spend.spendUsd >= spend.monthlyBudgetUsd) {
    const [overBudgetRun] = await sql`
      insert into task_runs (task_id, role_id, status, summary, cost_usd, duration_ms)
      values (
        ${task.id},
        ${role.id},
        'over_budget',
        ${`Team spend $${spend.spendUsd.toFixed(2)} has reached its $${spend.monthlyBudgetUsd.toFixed(2)} monthly budget — run refused before invoking Claude.`},
        0,
        0
      )
      returning *
    `;
    const error = new Error("team is over its monthly budget") as Error & {
      code: string;
      run: unknown;
    };
    error.code = "OVER_BUDGET";
    error.run = overBudgetRun;
    throw error;
  }

  // The run row is created now, at status "running", rather than only at
  // the end — task_run_events needs a run_id to attach to from the very
  // first streamed line, and any client polling/streaming this run should
  // see it exist immediately.
  const [runRow] = await sql`
    insert into task_runs (task_id, role_id, status)
    values (${task.id}, ${role.id}, 'running')
    returning *
  `;
  const runId = runRow.id as string;

  // running_since is the one signal any client can poll to know a run is
  // actually in flight right now, independent of `status` — cleared in the
  // finally block below so a crash (e.g. a worktree/git failure) can't leave
  // a Task stuck looking "running" forever.
  await sql`update tasks set running_since = now() where id = ${task.id}`;
  try {
    try {
      let manifest: WorkspaceManifest;
      let workspaceDir: string;
      // The Task's own workspace folder — distinct from `workspaceDir` once
      // repos are linked. manifest.json/activity.log (our app's metadata
      // about the run) live here, never inside the real repository being
      // worked on.
      const taskWorkspaceDir = resolveWorkspaceDir(task.id);
      // Deterministic order (not present before) so "primary" repo is
      // stable across re-runs/role handoffs, not accidentally different due
      // to unordered aggregation.
      const linkedRepos = await sql`
        select r.* from task_repositories tr
        join repositories r on r.id = tr.repository_id
        where tr.task_id = ${task.id}
        order by tr.repository_id
      `;
      // If the Task links one or more Repositories, work happens in real git
      // worktrees — one per repo, all on the same branch, each living inside
      // that repo's own localPath (not our app's internal folder), so
      // implementation work genuinely happens at the repository's own
      // configured location. cwd is the *primary* (first) repo's worktree
      // directly — Claude Code only resolves .claude/settings.json hooks
      // from the exact cwd, not by walking up to an ancestor (confirmed by
      // testing), so the harness's .claude/ gets copied in directly there.
      // Other linked repos still get their own worktrees (each under their
      // own localPath) but aren't cwd — the prompt gives their absolute
      // paths since they're no longer conveniently-nested siblings.
      if (linkedRepos.length > 0) {
        const repos = linkedRepos as unknown as Repository[];
        const worktrees = ensureWorktrees(task, repos);
        const [primary, ...others] = worktrees;
        workspaceDir = primary.worktreeDir;
        manifest = {
          branchName: taskBranchName(task),
          primary: {
            name: primary.repo.name,
            repositoryLocalPath: primary.repo.localPath,
            workspaceLocalPath: primary.worktreeDir,
          },
          otherRepos: others.map((w) => ({
            name: w.repo.name,
            repositoryLocalPath: w.repo.localPath,
            workspaceLocalPath: w.worktreeDir,
          })),
        };
      } else {
        // Scratch: workspaceDir and taskWorkspaceDir are the same folder,
        // same as before this distinction existed.
        workspaceDir = taskWorkspaceDir;
        manifest = {
          branchName: null,
          primary: { name: null, repositoryLocalPath: null, workspaceLocalPath: workspaceDir },
          otherRepos: [],
        };
      }
      copyHarnessSkills(workspaceDir, harnessDir);
      installCwdEnforcement(workspaceDir, taskWorkspaceDir, manifest);
      const systemPromptAppend = readRoleSystemPrompt(harnessDir);

      // Starting a run means work is happening: move backlog -> in_progress
      // before invoking Claude. The outcome then drives the next transition:
      // success -> in_review (ready for review), failure -> blocked.
      const startedStatus = await transitionTaskStatus(
        task.id,
        task.status,
        "in_progress",
      );

      const teamSnapshot =
        role.slug === "project-manager"
          ? await buildTeamSnapshot(task.teamId)
          : null;
      const prompt = buildPrompt(task, manifest, teamSnapshot, mentionContext);
      const result = await runClaudeStreaming(
        prompt,
        workspaceDir,
        runId,
        systemPromptAppend,
        taskWorkspaceDir,
        task.id,
      );

      await transitionTaskStatus(
        task.id,
        startedStatus,
        result.ok ? "in_review" : "blocked",
      );

      if (result.ok && manifest.branchName && !task.branchOrPrLink) {
        await sql`
          update tasks set branch_or_pr_link = ${manifest.branchName} where id = ${task.id}
        `;
      }

      const [run] = await sql`
        update task_runs
        set
          status = ${result.ok ? "succeeded" : "failed"},
          summary = ${result.summary},
          raw_output = ${sql.json(result.rawOutput as Parameters<typeof sql.json>[0])},
          cost_usd = ${result.costUsd},
          duration_ms = ${result.durationMs}
        where id = ${runId}
        returning *
      `;
      // publishRunEnd must only fire once the row above is already
      // terminal — otherwise a subscriber that checked status right before
      // this line could see "running" and then never get an end signal.
      publishRunEnd(runId);
      return run;
    } catch (err) {
      // A run row must never be left stuck at "running" forever, whatever
      // stage the failure happened at (worktree setup, the Claude process
      // itself, or a DB error) — same terminal-before-publish ordering as
      // the success path above.
      const message = err instanceof Error ? err.message : "run failed";
      await sql`
        update task_runs set status = 'failed', summary = ${message} where id = ${runId}
      `;
      publishRunEnd(runId);
      throw err;
    }
  } finally {
    await sql`update tasks set running_since = null where id = ${task.id}`;
  }
}
