import { useState } from "react";
import { Link } from "react-router-dom";
import {
  TASK_STATUS_TRANSITIONS,
  type Agent,
  type Repository,
  type TaskStatus,
  type TaskWithRepositories,
} from "@kompanion/shared";
import { Card, ErrorText } from "@/shared/ui/index.js";
import { useTeamSpend } from "@/features/budget/index.js";
import { RunTranscript, useRunTask, useTaskRuns } from "@/features/runs/index.js";
import { CommentsSection } from "./CommentsSection.js";
import { DependenciesSection } from "./DependenciesSection.js";

export function TaskCard({
  teamId,
  projectId,
  task,
  agents,
  allTasks,
  assignedAgent,
  repositories,
  onStatusChange,
  onAgentChange,
  onEdit,
}: {
  teamId: string;
  projectId: string;
  task: TaskWithRepositories;
  agents: Agent[];
  allTasks: TaskWithRepositories[];
  assignedAgent?: Agent;
  repositories: Repository[];
  onStatusChange: (status: TaskStatus) => void;
  onAgentChange: (agentId: string | null) => void;
  onEdit: () => void;
}) {
  const nextStatuses = TASK_STATUS_TRANSITIONS[task.status];
  // Every Agent has a harnessPath now (it's one of the only three fields a
  // Agent has) — the client can't check the filesystem, so this is an
  // optimistic guess for the "Run" affordance; the server is the real gate.
  const hasHarness = !!assignedAgent?.harnessPath;

  const spend = useTeamSpend(teamId, { enabled: hasHarness });
  const overBudget =
    !!spend.data &&
    spend.data.monthlyBudgetUsd != null &&
    spend.data.spendUsd >= spend.data.monthlyBudgetUsd;

  const runTask = useRunTask(teamId, task.id, projectId);

  // The server-side signal (runningSince), not local mutation state, is
  // what makes "running" survive navigation/reload/other tabs — it's kept
  // live by the parent board's polling of the tasks list. runTask.isPending
  // just covers the brief gap between clicking and the next poll landing.
  const isRunning = !!task.runningSince || runTask.isPending;
  const canRun = hasHarness && task.status !== "done" && !overBudget && !isRunning;

  const runs = useTaskRuns(teamId, task.id, { isRunning, enabled: hasHarness });
  const latestRun = runs.data?.[0];
  const runCount = runs.data?.length ?? 0;
  // over_budget refusals already have cost_usd: 0 and a still-running run
  // has cost_usd: null (excluded via ?? 0) — both fall out correctly here
  // with no special-casing.
  const totalCostUsd = (runs.data ?? []).reduce(
    (sum, r) => sum + (r.costUsd ?? 0),
    0,
  );
  // The in-flight run contributes nothing to the sum above (its cost_usd is
  // still null), so the transcript hands us its live estimate to add on.
  const [liveCostUsd, setLiveCostUsd] = useState<number | null>(null);
  const displayedCostUsd = totalCostUsd + (liveCostUsd ?? 0);

  return (
    <Card tone="soft" className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{task.title}</span>
        <div className="flex items-center gap-1">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
            {task.type}
          </span>
          <Link
            className="text-xs text-neutral-400 hover:text-neutral-700"
            to={`/projects/${projectId}/tasks/${task.id}`}
            title="Open task page"
          >
            Expand
          </Link>
          <button
            className="text-xs text-neutral-400 hover:text-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:text-neutral-300"
            disabled={isRunning}
            title={isRunning ? "Task is running — edits are locked" : undefined}
            onClick={onEdit}
          >
            Edit
          </button>
        </div>
      </div>

      {task.description && (
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Description</summary>
          <p className="mt-1 whitespace-pre-wrap">{task.description}</p>
        </details>
      )}

      <select
        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
        value={task.agentId ?? ""}
        disabled={isRunning}
        title={isRunning ? "Task is running — assignment is locked" : undefined}
        onChange={(e) => onAgentChange(e.target.value || null)}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.title}
          </option>
        ))}
      </select>
      {assignedAgent && (
        <p className="text-xs text-neutral-400">Assigned: {assignedAgent.title}</p>
      )}
      {repositories.length > 0 && (
        <p className="text-xs text-neutral-400">
          Repos: {repositories.map((r) => r.name).join(", ")}
          {task.branchOrPrLink && ` @ ${task.branchOrPrLink}`}
        </p>
      )}
      {displayedCostUsd > 0 && (
        <p className="text-xs text-neutral-400">
          💰 {liveCostUsd !== null && "≈"}${displayedCostUsd.toFixed(4)} spent
          {liveCostUsd !== null && " (running)"}
        </p>
      )}

      <DependenciesSection teamId={teamId} task={task} allTasks={allTasks} />

      {/* Only the count here — the task page (Expand) is where a run's
          status, cost and transcript are read. */}
      <p className="border-t border-neutral-100 pt-2 text-xs text-neutral-400">
        {runCount === 0
          ? "Not run yet."
          : `${runCount} run${runCount === 1 ? "" : "s"}`}
      </p>

      <CommentsSection teamId={teamId} task={task} agents={agents} />

      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {nextStatuses.map((status) => (
            <button
              key={status}
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
              onClick={() => onStatusChange(status)}
            >
              → {status.replace("_", " ")}
            </button>
          ))}
        </div>
      )}

      {hasHarness && task.status !== "done" && (
        <div className="space-y-1 border-t border-neutral-100 pt-2">
          <button
            className="w-full rounded border border-neutral-900 bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
            disabled={!canRun}
            onClick={() => runTask.mutate()}
          >
            {isRunning
              ? "Running…"
              : overBudget
                ? "Over budget"
                : "Run with Claude"}
          </button>

          {runTask.isError && (
            <ErrorText>{(runTask.error as Error).message}</ErrorText>
          )}

          {latestRun && isRunning && latestRun.status === "running" && (
            <RunTranscript
              teamId={teamId}
              taskId={task.id}
              runId={latestRun.id}
              runtime={latestRun.runtime}
              onCostChange={setLiveCostUsd}
            />
          )}

          {latestRun && !isRunning && latestRun.status === "over_budget" && (
            <p className="text-xs text-amber-700">{latestRun.summary}</p>
          )}
        </div>
      )}
    </Card>
  );
}
