import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ProjectChrome } from "@/app/layouts/ProjectChrome.js";
import { useCurrentTeamId } from "@/features/teams/index.js";
import {
  CommentsThread,
  TaskDiff,
  TaskSidebar,
  countChangedFiles,
  useTask,
  useTaskComments,
  useTaskDiff,
} from "@/features/tasks/index.js";
import { useTeamAgents } from "@/features/agents/index.js";
import { RunRow, useTaskRuns } from "@/features/runs/index.js";

// The board card's "Expand" used to open a modal; it now links here, so this
// is a real route with its own URL — shareable, reloadable, and back-button
// friendly. Team resolution mirrors ProjectShell (first team of the project),
// since routes are project-scoped and there is still no team switcher.
export function TaskPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();

  const teams = useCurrentTeamId(projectId);
  const teamId = teams.teamId;

  const tasks = useTask(teamId, taskId);
  const task = tasks.data;

  const runs = useTaskRuns(teamId, taskId, { isRunning: !!task?.runningSince });
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
    // Side by side from md up; below that the sidebar stacks under the task
    // column, which would otherwise be squeezed to nothing on a phone.
    <div className="flex h-[calc(100vh-13rem)] w-full max-w-6xl flex-col gap-4 md:flex-row">
      <div className="flex min-h-0 min-w-0 max-w-4xl flex-1 flex-col gap-3">
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

          {teamId && (
            <TaskTabs
              teamId={teamId}
              taskId={task.id}
              runCount={runs.data?.length}
              isRunning={!!task.runningSince}
            >
              {runs.data && runs.data.length > 0 ? (
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
            </TaskTabs>
          )}
        </>
      )}
      </div>
      {task && <TaskSidebar runs={runs.data} isError={runs.isError} />}
    </div>,
  );
}

type Tab = "runs" | "comments" | "diff";

// Runs, comments and the diff share the space under the description, one at
// a time.
// Runs is the default so the page still opens on what the agents did.
function TaskTabs({
  teamId,
  taskId,
  runCount,
  isRunning,
  children,
}: {
  teamId: string;
  taskId: string;
  runCount: number | undefined;
  isRunning: boolean;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("runs");
  const comments = useTaskComments(teamId, taskId);
  const agents = useTeamAgents(teamId);
  // Fetched even while another tab is open so the Diff label can show the
  // count; TaskDiff shares this query's cache.
  const diff = useTaskDiff(teamId, taskId, { enabled: true, isRunning });

  const tabs: { id: Tab; label: string; count: number | undefined }[] = [
    { id: "runs", label: "Runs", count: runCount },
    { id: "comments", label: "Comments", count: comments.data?.length },
    { id: "diff", label: "Diff", count: countChangedFiles(diff.data) },
  ];

  // WAI-ARIA tabs pattern: only the selected tab is in the Tab sequence
  // (roving tabIndex); arrow keys, Home and End move between tabs and
  // select them as they go.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const id = tabs[next]!.id;
    setTab(id);
    document.getElementById(`task-tab-${id}`)?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        role="tablist"
        className="flex shrink-0 gap-1 border-b border-neutral-200"
        onKeyDown={onKeyDown}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`task-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`task-tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={
              "-mb-px border-b-2 px-3 py-1 text-sm " +
              (tab === t.id
                ? "border-neutral-900 font-medium text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-700")
            }
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* The Runs and Comments panels stay mounted and the inactive one is only
          hidden, so a comment draft survives a trip to the Runs tab and back. */}
      <div
        id="task-tabpanel-runs"
        role="tabpanel"
        aria-labelledby="task-tab-runs"
        hidden={tab !== "runs"}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </div>
      <div
        id="task-tabpanel-comments"
        role="tabpanel"
        aria-labelledby="task-tab-comments"
        hidden={tab !== "comments"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CommentsThread teamId={teamId} taskId={taskId} agents={agents.data ?? []} />
        </div>
      </div>
      <div
        id="task-tabpanel-diff"
        role="tabpanel"
        aria-labelledby="task-tab-diff"
        hidden={tab !== "diff"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Mounted only while selected so a large diff doesn't render (and
              re-render on polling) in the hidden panel. */}
          {tab === "diff" && (
            <TaskDiff teamId={teamId} taskId={taskId} active isRunning={isRunning} />
          )}
        </div>
      </div>
    </div>
  );
}
