import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { RunTranscript } from "./RunTranscript.js";
import { RUN_STATUS_ICON, formatRunCost } from "./runStatus.js";

// The board card's "Expand" used to open a modal; it now links here, so this
// is a real route with its own URL — shareable, reloadable, and back-button
// friendly. Team resolution mirrors ProjectShell (first team of the project),
// since routes are project-scoped and there is still no team switcher.
export function TaskPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();

  const teams = useQuery({
    queryKey: ["teams", projectId],
    queryFn: () => api.listTeams(projectId!),
    enabled: !!projectId,
  });
  const teamId = teams.data?.[0]?.id ?? null;

  // There is no single-task endpoint; the list is already the app's source of
  // truth for a task (and is polled the same way the board polls it, so
  // status/runningSince stay live on this page too).
  const tasks = useQuery({
    queryKey: ["tasks", teamId],
    queryFn: () => api.listTasks(teamId!),
    enabled: !!teamId,
    refetchInterval: 4000,
  });
  const task = tasks.data?.find((t) => t.id === taskId);

  const isRunning = !!task?.runningSince;
  const runs = useQuery({
    queryKey: ["taskRuns", taskId],
    queryFn: () => api.listTaskRuns(teamId!, taskId!),
    enabled: !!teamId && !!taskId,
    refetchInterval: isRunning ? 3000 : false,
  });
  const run = runs.data?.[0];

  const backToBoard = (
    <Link
      to={projectId ? `/projects/${projectId}/board` : "/"}
      className="text-xs text-neutral-500 hover:text-neutral-700"
    >
      ← Board
    </Link>
  );

  // A project id that resolves to no team (a bad URL, or a project whose team
  // has not been created yet) leaves teamId null forever, so the task query
  // never runs — without this the page would sit on "Loading…" indefinitely.
  const noTeam = !!teams.data && teams.data.length === 0;

  // The same dead end reached a different way: a failed request leaves its
  // `data` undefined for good, so neither the task nor the not-found branch
  // below can ever resolve and the page would sit on "Loading…" forever.
  if (teams.isError || tasks.isError) {
    return (
      <main className="mx-auto max-w-xl px-6 py-8">
        <p className="text-sm text-neutral-600">Could not load this task. {backToBoard}</p>
      </main>
    );
  }

  if (noTeam || (tasks.data && !task)) {
    return (
      <main className="mx-auto max-w-xl px-6 py-8">
        <p className="text-sm text-neutral-600">Task not found. {backToBoard}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-4xl flex-col gap-3 px-6 py-6">
      {backToBoard}

      {!task ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-medium">{task.title}</h2>
            <p className="text-xs text-neutral-500">
              {task.type} · {task.status.replace("_", " ")}
            </p>
          </div>

          {task.description && (
            <p className="max-h-32 shrink-0 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-sm text-neutral-700">
              {task.description}
            </p>
          )}

          {teamId && run ? (
            <>
              <p className="shrink-0 text-xs text-neutral-500">
                {RUN_STATUS_ICON[run.status]} {run.agentTitle ?? "Unknown agent"} ·{" "}
                {run.status.replace("_", " ")} ·{" "}
                {new Date(run.createdAt).toLocaleString()}
                {run.durationMs != null &&
                  ` · ${(run.durationMs / 1000).toFixed(1)}s`}
                {` · ${formatRunCost(run.costUsd)}`}
              </p>
              <RunTranscript
                teamId={teamId}
                taskId={task.id}
                runId={run.id}
                className="min-h-0 flex-1"
              />
            </>
          ) : (
            runs.data && (
              <p className="text-sm text-neutral-400">This task has not been run yet.</p>
            )
          )}
        </>
      )}
    </main>
  );
}
