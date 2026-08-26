import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { RunTranscript } from "./RunTranscript.js";
import { RUN_STATUS_ICON, formatRunCost } from "./runStatus.js";
import { ProjectChrome } from "./ProjectChrome.js";

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
  // Accordion state: exactly one run's transcript is open at a time. null
  // means "nothing picked yet", which resolves to the newest run — so the
  // page opens on the latest run, and keeps following it across refetches
  // until the reader picks a different one.
  const [chosenRunId, setChosenRunId] = useState<string | null>(null);
  const openRunId = chosenRunId ?? runs.data?.[0]?.id ?? null;

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
  // Every branch renders inside the same project frame the board and the
  // other sections use — this page is routed outside ProjectShell (its URL
  // isn't a :section), which is why it has to ask for the chrome itself.
  const framed = (children: React.ReactNode) =>
    projectId ? (
      <ProjectChrome projectId={projectId}>{children}</ProjectChrome>
    ) : (
      <main className="mx-auto max-w-xl px-6 py-8">{children}</main>
    );

  if (teams.isError || tasks.isError) {
    return framed(
      <p className="text-sm text-neutral-600">Could not load this task. {backToBoard}</p>,
    );
  }

  if (noTeam || (tasks.data && !task)) {
    return framed(
      <p className="text-sm text-neutral-600">Task not found. {backToBoard}</p>,
    );
  }

  return framed(
    <div className="flex h-[calc(100vh-13rem)] w-full max-w-4xl flex-col gap-3">
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

          {teamId && runs.data && runs.data.length > 0 ? (
            // The list scrolls, not the transcript's container — with one row
            // per run the headers alone can outgrow the viewport, so a
            // flex-1 transcript would squeeze them out. The open transcript
            // gets a bounded height and scrolls internally instead.
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {runs.data.map((r) => {
                const isOpen = r.id === openRunId;
                return (
                  <div
                    key={r.id}
                    className="shrink-0 overflow-hidden rounded border border-neutral-200"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setChosenRunId(r.id)}
                      className={`flex w-full flex-wrap items-center gap-x-2 px-3 py-2 text-left text-xs ${
                        isOpen
                          ? "bg-neutral-100 text-neutral-700"
                          : "text-neutral-500 hover:bg-neutral-50"
                      }`}
                    >
                      <span className="font-medium text-neutral-700">
                        {RUN_STATUS_ICON[r.status]} {r.agentTitle ?? "Unknown agent"}
                      </span>
                      <span>· {r.status.replace("_", " ")}</span>
                      <span>· {new Date(r.createdAt).toLocaleString()}</span>
                      {r.durationMs != null && (
                        <span>· {(r.durationMs / 1000).toFixed(1)}s</span>
                      )}
                      <span>· {formatRunCost(r.costUsd)}</span>
                    </button>

                    {/* Only the open run is mounted: every RunTranscript opens
                        its own EventSource, so rendering them all would hold
                        one live SSE connection per run on the task. */}
                    {isOpen && (
                      <RunTranscript
                        teamId={teamId}
                        taskId={task.id}
                        runId={r.id}
                        className="max-h-[55vh] rounded-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            runs.data && (
              <p className="text-sm text-neutral-400">This task has not been run yet.</p>
            )
          )}
        </>
      )}
    </div>,
  );
}
