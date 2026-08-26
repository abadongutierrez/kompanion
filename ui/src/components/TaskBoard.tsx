import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TASK_STATUS_TRANSITIONS,
  type Repository,
  type Agent,
  type TaskDependencyType,
  type TaskStatus,
  type TaskType,
  type TaskWithRepositories,
} from "@kompanion/shared";
import { api } from "../api.js";
import { RunTranscript } from "./RunTranscript.js";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In Progress" },
  { status: "in_review", label: "In Review" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

const DEPENDENCY_TYPES: TaskDependencyType[] = [
  "blocked_by",
  "depends_on",
  "relates_to",
];

type BoardView = { type: "list" } | { type: "new" } | { type: "edit"; taskId: string };

export function TaskBoard({
  teamId,
  projectId,
}: {
  teamId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<BoardView>({ type: "list" });

  const agents = useQuery({
    queryKey: ["agents", teamId],
    queryFn: () => api.listAgents(teamId),
  });

  const repositories = useQuery({
    queryKey: ["repositories", projectId],
    queryFn: () => api.listRepositories(projectId),
  });

  // Polled rather than only invalidated on local mutations: a run is a
  // server-side process that can outlive the tab that started it (up to
  // 180s), and `runningSince`/`status` need to stay live on any page
  // watching this team's board, not just the one that clicked "Run".
  const tasks = useQuery({
    queryKey: ["tasks", teamId],
    queryFn: () => api.listTasks(teamId),
    refetchInterval: 4000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api.updateTaskStatus(teamId, taskId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", teamId] }),
  });

  const assignAgent = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string | null }) =>
      api.assignTaskAgent(teamId, taskId, agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", teamId] }),
  });

  if (agents.isLoading || tasks.isLoading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (view.type === "new") {
    return (
      <NewTaskPage
        teamId={teamId}
        agents={agents.data ?? []}
        repositories={repositories.data ?? []}
        onBack={() => setView({ type: "list" })}
      />
    );
  }

  if (view.type === "edit") {
    const task = (tasks.data ?? []).find((t) => t.id === view.taskId);
    if (task) {
      const reposById = new Map((repositories.data ?? []).map((r) => [r.id, r]));
      return (
        <EditTaskPage
          teamId={teamId}
          task={task}
          repositories={task.repositoryIds
            .map((id) => reposById.get(id))
            .filter((r): r is Repository => !!r)}
          allRepositories={repositories.data ?? []}
          onBack={() => setView({ type: "list" })}
        />
      );
    }
    // Task no longer exists (e.g. deleted elsewhere) — offer a way back
    // rather than silently falling through to the list mid-render.
    return (
      <div className="max-w-2xl space-y-4">
        <BackToBoardButton onBack={() => setView({ type: "list" })} />
        <p className="text-sm text-neutral-500">This task no longer exists.</p>
      </div>
    );
  }

  const agentsById = new Map((agents.data ?? []).map((r) => [r.id, r]));
  const reposById = new Map((repositories.data ?? []).map((r) => [r.id, r]));
  const runningTasks = (tasks.data ?? []).filter((t) => t.runningSince);

  return (
    <div className="space-y-6">
      {(agents.data ?? []).length === 0 && (
        <p className="text-sm text-neutral-500">
          No agents yet on this team — add some in the Agents section before assigning
          tasks.
        </p>
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
          const columnTasks = (tasks.data ?? []).filter(
            (t) => t.status === column.status,
          );
          return (
            <div key={column.status} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-neutral-500">
                {column.label} ({columnTasks.length})
              </h3>
              <div className="space-y-2">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    teamId={teamId}
                    task={task}
                    agents={agents.data ?? []}
                    allTasks={tasks.data ?? []}
                    assignedAgent={task.agentId ? agentsById.get(task.agentId) : undefined}
                    repositories={task.repositoryIds
                      .map((id) => reposById.get(id))
                      .filter((r): r is Repository => !!r)}
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

function BackToBoardButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      className="text-sm text-neutral-500 hover:text-neutral-800"
      onClick={onBack}
    >
      ← Back to board
    </button>
  );
}

function NewTaskPage({
  teamId,
  agents,
  repositories,
  onBack,
}: {
  teamId: string;
  agents: Agent[];
  repositories: Repository[];
  onBack: () => void;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <BackToBoardButton onBack={onBack} />
      <h2 className="text-lg font-semibold">New Task</h2>
      <CreateTaskForm
        teamId={teamId}
        agents={agents}
        repositories={repositories}
        onCreated={onBack}
        onCancel={onBack}
      />
    </div>
  );
}

function EditTaskPage({
  teamId,
  task,
  repositories,
  allRepositories,
  onBack,
}: {
  teamId: string;
  task: TaskWithRepositories;
  repositories: Repository[];
  allRepositories: Repository[];
  onBack: () => void;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <BackToBoardButton onBack={onBack} />
      <h2 className="text-lg font-semibold">Edit Task</h2>
      <EditTaskForm
        teamId={teamId}
        task={task}
        repositories={repositories}
        allRepositories={allRepositories}
        onDone={onBack}
      />
    </div>
  );
}

function TaskCard({
  teamId,
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
  const queryClient = useQueryClient();

  const spend = useQuery({
    queryKey: ["teamSpend", teamId],
    queryFn: () => api.getTeamSpend(teamId),
    enabled: !!hasHarness,
  });
  const overBudget =
    !!spend.data &&
    spend.data.monthlyBudgetUsd != null &&
    spend.data.spendUsd >= spend.data.monthlyBudgetUsd;

  const runTask = useMutation({
    mutationFn: () => api.runTask(teamId, task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskRuns", task.id] });
      queryClient.invalidateQueries({ queryKey: ["teamSpend", teamId] });
      // A run can move the task's status (backlog -> in_progress -> in_review/blocked).
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
    },
  });

  // The server-side signal (runningSince), not local mutation state, is
  // what makes "running" survive navigation/reload/other tabs — it's kept
  // live by the parent board's polling of the tasks list. runTask.isPending
  // just covers the brief gap between clicking and the next poll landing.
  const isRunning = !!task.runningSince || runTask.isPending;
  const canRun = hasHarness && task.status !== "done" && !overBudget && !isRunning;

  const runs = useQuery({
    queryKey: ["taskRuns", task.id],
    queryFn: () => api.listTaskRuns(teamId, task.id),
    enabled: !!hasHarness,
    refetchInterval: isRunning ? 3000 : false,
  });
  const latestRun = runs.data?.[0];
  // over_budget refusals already have cost_usd: 0 and a still-running run
  // has cost_usd: null (excluded via ?? 0) — both fall out correctly here
  // with no special-casing.
  const totalCostUsd = (runs.data ?? []).reduce(
    (sum, r) => sum + (r.costUsd ?? 0),
    0,
  );

  return (
    <div className="space-y-2 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{task.title}</span>
        <div className="flex items-center gap-1">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
            {task.type}
          </span>
          <button
            className="text-xs text-neutral-400 hover:text-neutral-700"
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
        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
        value={task.agentId ?? ""}
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
      {totalCostUsd > 0 && (
        <p className="text-xs text-neutral-400">
          💰 ${totalCostUsd.toFixed(4)} spent
        </p>
      )}

      <DependenciesSection teamId={teamId} task={task} allTasks={allTasks} />

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
            <p className="text-xs text-red-600">
              {(runTask.error as Error).message}
            </p>
          )}

          {latestRun && isRunning && latestRun.status === "running" && (
            <RunTranscript teamId={teamId} taskId={task.id} runId={latestRun.id} />
          )}

          {latestRun && !isRunning && latestRun.status === "over_budget" && (
            <p className="text-xs text-amber-700">{latestRun.summary}</p>
          )}

          {latestRun && !isRunning && latestRun.status !== "over_budget" && (
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer">
                {latestRun.status === "succeeded" ? "✅" : "❌"} last run —{" "}
                {new Date(latestRun.createdAt).toLocaleTimeString()}
              </summary>
              <div className="mt-1">
                <RunTranscript teamId={teamId} taskId={task.id} runId={latestRun.id} />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function EditTaskForm({
  teamId,
  task,
  repositories,
  allRepositories,
  onDone,
}: {
  teamId: string;
  task: TaskWithRepositories;
  repositories: Repository[];
  allRepositories: Repository[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [type, setType] = useState<TaskType>(task.type);
  const [description, setDescription] = useState(task.description ?? "");
  const [repositoryIds, setRepositoryIds] = useState(repositories.map((r) => r.id));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      await api.updateTask(teamId, task.id, {
        title,
        type,
        description: description || null,
      });

      const originalIds = new Set(repositories.map((r) => r.id));
      const nextIds = new Set(repositoryIds);
      for (const id of nextIds) {
        if (!originalIds.has(id)) await api.addTaskRepository(teamId, task.id, id);
      }
      for (const id of originalIds) {
        if (!nextIds.has(id)) await api.removeTaskRepository(teamId, task.id, id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      onDone();
    },
  });

  const deleteTask = useMutation({
    mutationFn: () => api.deleteTask(teamId, task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      onDone();
    },
  });

  function toggleRepository(repoId: string) {
    setRepositoryIds((current) =>
      current.includes(repoId)
        ? current.filter((id) => id !== repoId)
        : [...current, repoId],
    );
  }

  return (
    <form
      className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) save.mutate();
      }}
    >
      <input
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
        value={type}
        onChange={(e) => setType(e.target.value as TaskType)}
      >
        <option value="story">Story</option>
        <option value="bug">Bug</option>
        <option value="chore">Chore</option>
        <option value="spike">Spike</option>
      </select>
      <textarea
        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
        placeholder="Description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {allRepositories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
          <span className="font-medium text-neutral-500">Repos:</span>
          {allRepositories.map((repo) => (
            <label key={repo.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={repositoryIds.includes(repo.id)}
                onChange={() => toggleRepository(repo.id)}
              />
              {repo.name}
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
          disabled={save.isPending}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
          onClick={onDone}
        >
          Cancel
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-red-600">Delete this task for good?</span>
            <button
              type="button"
              className="rounded bg-red-600 px-3 py-1 text-xs text-white disabled:opacity-50"
              disabled={deleteTask.isPending}
              onClick={() => deleteTask.mutate()}
            >
              Confirm delete
            </button>
            <button
              type="button"
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-xs text-red-600 hover:text-red-800"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete task
          </button>
        )}
      </div>
    </form>
  );
}

function DependenciesSection({
  teamId,
  task,
  allTasks,
}: {
  teamId: string;
  task: TaskWithRepositories;
  allTasks: TaskWithRepositories[];
}) {
  const queryClient = useQueryClient();
  const [relatedTaskId, setRelatedTaskId] = useState("");
  const [depType, setDepType] = useState<TaskDependencyType>("blocked_by");

  const dependencies = useQuery({
    queryKey: ["taskDependencies", task.id],
    queryFn: () => api.listTaskDependencies(teamId, task.id),
  });

  const addDependency = useMutation({
    mutationFn: () =>
      api.addTaskDependency(teamId, task.id, { relatedTaskId, type: depType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskDependencies", task.id] });
      setRelatedTaskId("");
    },
  });

  const removeDependency = useMutation({
    mutationFn: (dependencyId: string) =>
      api.removeTaskDependency(teamId, task.id, dependencyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["taskDependencies", task.id] }),
  });

  const otherTasks = allTasks.filter((t) => t.id !== task.id);

  return (
    <div className="space-y-1 border-t border-neutral-100 pt-2 text-xs">
      {(dependencies.data ?? []).map((dep) => (
        <div key={dep.id} className="flex items-center justify-between">
          <span
            className={
              dep.type === "blocked_by" ? "text-amber-600" : "text-neutral-500"
            }
          >
            {dep.type.replace("_", " ")}: {dep.relatedTaskTitle}
          </span>
          <button
            className="text-neutral-400 hover:text-red-600"
            onClick={() => removeDependency.mutate(dep.id)}
          >
            ✕
          </button>
        </div>
      ))}

      {otherTasks.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (relatedTaskId) addDependency.mutate();
          }}
        >
          <select
            className="rounded border border-neutral-200 px-1 py-0.5"
            value={depType}
            onChange={(e) => setDepType(e.target.value as TaskDependencyType)}
          >
            {DEPENDENCY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            className="min-w-0 flex-1 rounded border border-neutral-200 px-1 py-0.5"
            value={relatedTaskId}
            onChange={(e) => setRelatedTaskId(e.target.value)}
          >
            <option value="">Link to task…</option>
            {otherTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100"
            disabled={addDependency.isPending}
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}

function CommentsSection({
  teamId,
  task,
  agents,
}: {
  teamId: string;
  task: TaskWithRepositories;
  agents: Agent[];
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [asAgentId, setAsAgentId] = useState("");

  const comments = useQuery({
    queryKey: ["taskComments", task.id],
    queryFn: () => api.listTaskComments(teamId, task.id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["taskComments", task.id] });

  const addComment = useMutation({
    mutationFn: () =>
      api.addTaskComment(teamId, task.id, { agentId: asAgentId || null, body }),
    onSuccess: () => {
      invalidate();
      setBody("");
    },
  });

  const replyAsAgent = useMutation({
    mutationFn: ({ commentId, agentId }: { commentId: string; agentId: string }) =>
      api.replyAsAgent(teamId, task.id, commentId, agentId),
    onSuccess: invalidate,
  });

  const count = comments.data?.length ?? 0;

  return (
    <details className="space-y-2 border-t border-neutral-100 pt-2 text-xs">
      <summary className="cursor-pointer font-medium text-neutral-500">
        Comments {count > 0 && `(${count})`}
      </summary>

      {(comments.data ?? []).map((comment) => (
        <div key={comment.id} className="space-y-1 rounded bg-neutral-50 p-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-medium text-neutral-600">
              {comment.authorTitle ?? "Operator"}
            </span>
            <span>{new Date(comment.createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="whitespace-pre-wrap text-neutral-700">{comment.body}</p>
          {comment.mentionedAgents.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {comment.mentionedAgents.map((agent) => (
                <button
                  key={agent.id}
                  className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                  disabled={
                    replyAsAgent.isPending &&
                    replyAsAgent.variables?.commentId === comment.id &&
                    replyAsAgent.variables?.agentId === agent.id
                  }
                  onClick={() =>
                    replyAsAgent.mutate({ commentId: comment.id, agentId: agent.id })
                  }
                >
                  {replyAsAgent.isPending &&
                  replyAsAgent.variables?.commentId === comment.id &&
                  replyAsAgent.variables?.agentId === agent.id
                    ? `Running ${agent.title}…`
                    : `Run as ${agent.title}`}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) addComment.mutate();
        }}
      >
        <textarea
          className="w-full rounded border border-neutral-200 px-2 py-1"
          placeholder="Add a comment… mention an agent with @slug"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex items-center gap-1">
          <select
            className="rounded border border-neutral-200 px-1 py-0.5"
            value={asAgentId}
            onChange={(e) => setAsAgentId(e.target.value)}
          >
            <option value="">as Operator</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                as {agent.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100 disabled:opacity-50"
            disabled={addComment.isPending}
          >
            Comment
          </button>
        </div>
      </form>
    </details>
  );
}

function CreateTaskForm({
  teamId,
  agents,
  repositories,
  onCreated,
  onCancel,
}: {
  teamId: string;
  agents: Agent[];
  repositories: Repository[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>("story");
  const [agentId, setAgentId] = useState("");
  const [repositoryIds, setRepositoryIds] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createTask({
        teamId,
        title,
        type,
        description: description || null,
        agentId: agentId || null,
        repositoryIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
      onCreated();
    },
  });

  function toggleRepository(repoId: string) {
    setRepositoryIds((current) =>
      current.includes(repoId)
        ? current.filter((id) => id !== repoId)
        : [...current, repoId],
    );
  }

  return (
    <form
      className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) mutation.mutate();
      }}
    >
      <input
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
        value={type}
        onChange={(e) => setType(e.target.value as TaskType)}
      >
        <option value="story">Story</option>
        <option value="bug">Bug</option>
        <option value="chore">Chore</option>
        <option value="spike">Spike</option>
      </select>
      <select
        className="rounded border border-neutral-300 px-2 py-1 text-xs"
        value={agentId}
        onChange={(e) => setAgentId(e.target.value)}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.title}
          </option>
        ))}
      </select>
      <textarea
        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
        placeholder="Description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {repositories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
          <span className="font-medium text-neutral-500">Repos:</span>
          {repositories.map((repo) => (
            <label key={repo.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={repositoryIds.includes(repo.id)}
                onChange={() => toggleRepository(repo.id)}
              />
              {repo.name}
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
          disabled={mutation.isPending}
        >
          Create task
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
