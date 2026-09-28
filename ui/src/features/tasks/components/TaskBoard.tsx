import { useState } from "react";
import type { Repository, TaskStatus, TaskWithRepositories } from "@kompanion/shared";
import { Muted, SectionHeading } from "@/shared/ui/index.js";
import { useTeamAgents } from "@/features/agents/index.js";
import { useRepositories } from "@/features/repositories/index.js";
import { useAssignTaskAgent, useTasks, useUpdateTaskStatus } from "../hooks.js";
import { CreateTaskForm } from "./CreateTaskForm.js";
import { EditTaskForm } from "./EditTaskForm.js";
import { TaskCard } from "./TaskCard.js";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In Progress" },
  { status: "in_review", label: "In Review" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

type BoardView = { type: "list" } | { type: "new" } | { type: "edit"; taskId: string };

export function TaskBoard({
  teamId,
  projectId,
}: {
  teamId: string;
  projectId: string;
}) {
  const [view, setView] = useState<BoardView>({ type: "list" });

  const agents = useTeamAgents(teamId);
  const repositories = useRepositories(projectId);
  // Polled rather than only invalidated on local mutations: a run is a
  // server-side process that can outlive the tab that started it (up to
  // 180s), and `runningSince`/`status` need to stay live on any page
  // watching this team's board, not just the one that clicked "Run".
  const tasks = useTasks(teamId);

  const updateStatus = useUpdateTaskStatus(teamId);
  const assignAgent = useAssignTaskAgent(teamId);

  const allAgents = agents.data ?? [];
  const allRepositories = repositories.data ?? [];
  const allTasks = tasks.data ?? [];
  const backToList = () => setView({ type: "list" });

  if (agents.isLoading || tasks.isLoading) {
    return <Muted>Loading…</Muted>;
  }

  if (view.type === "new") {
    return (
      <BoardSubPage title="New Task" onBack={backToList}>
        <CreateTaskForm
          teamId={teamId}
          agents={allAgents}
          repositories={allRepositories}
          onCreated={backToList}
          onCancel={backToList}
        />
      </BoardSubPage>
    );
  }

  if (view.type === "edit") {
    const task = allTasks.find((t) => t.id === view.taskId);
    // Task no longer exists (e.g. deleted elsewhere) — offer a way back
    // rather than silently falling through to the list mid-render.
    if (!task) {
      return (
        <BoardSubPage onBack={backToList}>
          <Muted>This task no longer exists.</Muted>
        </BoardSubPage>
      );
    }
    return (
      <BoardSubPage title="Edit Task" onBack={backToList}>
        {/* Also guards the case where a run starts while this page is open —
            the board polls, so the form swaps out on the next tick. */}
        {task.runningSince ? (
          <p className="text-sm text-amber-700">
            This task is running — it can't be edited until the run finishes.
          </p>
        ) : (
          <EditTaskForm
            teamId={teamId}
            task={task}
            repositories={repositoriesFor(task, allRepositories)}
            allRepositories={allRepositories}
            onDone={backToList}
          />
        )}
      </BoardSubPage>
    );
  }

  const agentsById = new Map(allAgents.map((a) => [a.id, a]));
  const runningTasks = allTasks.filter((t) => t.runningSince);

  return (
    <div className="space-y-6">
      {allAgents.length === 0 && (
        <Muted>
          No agents yet on this team — add some in the Agents section before assigning
          tasks.
        </Muted>
      )}

      <div className="flex items-center gap-3">
        <button
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
          onClick={() => setView({ type: "new" })}
        >
          + New Task
        </button>
        {runningTasks.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            {runningTasks.length} task{runningTasks.length === 1 ? "" : "s"} running:{" "}
            {runningTasks.map((t) => t.title).join(", ")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {COLUMNS.map((column) => {
          const columnTasks = allTasks.filter((t) => t.status === column.status);
          return (
            <div key={column.status} className="space-y-2">
              <SectionHeading as="h3">
                {column.label} ({columnTasks.length})
              </SectionHeading>
              <div className="space-y-2">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    teamId={teamId}
                    projectId={projectId}
                    task={task}
                    agents={allAgents}
                    allTasks={allTasks}
                    assignedAgent={task.agentId ? agentsById.get(task.agentId) : undefined}
                    repositories={repositoriesFor(task, allRepositories)}
                    onStatusChange={(status) =>
                      updateStatus.mutate({ taskId: task.id, status })
                    }
                    onAgentChange={(agentId) =>
                      assignAgent.mutate({ taskId: task.id, agentId })
                    }
                    onEdit={() => setView({ type: "edit", taskId: task.id })}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A task carries repository ids; the board holds the repositories. Resolving
// one against the other was written out three times before this.
function repositoriesFor(task: TaskWithRepositories, all: Repository[]): Repository[] {
  const byId = new Map(all.map((r) => [r.id, r]));
  return task.repositoryIds
    .map((id) => byId.get(id))
    .filter((r): r is Repository => !!r);
}

// The board's two full-page modes (new task, edit task) share a frame: a way
// back, and an optional heading.
function BoardSubPage({
  title,
  onBack,
  children,
}: {
  title?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <button
        className="text-sm text-neutral-500 hover:text-neutral-800"
        onClick={onBack}
      >
        ← Back to board
      </button>
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {children}
    </div>
  );
}
