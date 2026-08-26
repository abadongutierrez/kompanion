import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { ProjectChrome } from "./ProjectChrome.js";
import { RunRow } from "./RunRow.js";

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
  // Accordion state: at most one run's transcript is open at a time.
  // "auto" is the untouched state — it resolves to the newest run, so the
  // page opens on the latest and keeps following it across refetches until
  // the reader picks one. Collapsing needs its own state rather than a null
  // runId, or "closed" would be indistinguishable from "auto" and the newest
  // run would spring straight back open.
  type OpenChoice =
    | { kind: "auto" }
    | { kind: "open"; runId: string }
    | { kind: "closed" };
  const [choice, setChoice] = useState<OpenChoice>({ kind: "auto" });

  const openRunId =
    choice.kind === "open"
      ? choice.runId
      : choice.kind === "auto"
        ? (runs.data?.[0]?.id ?? null)
        : null;

  const toggleRun = (runId: string) =>
    setChoice(runId === openRunId ? { kind: "closed" } : { kind: "open", runId });

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
              {runs.data.map((r) => (
                <RunRow
                  key={r.id}
                  run={r}
                  teamId={teamId}
                  taskId={task.id}
                  isOpen={r.id === openRunId}
                  onToggle={() => toggleRun(r.id)}
                />
              ))}
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
