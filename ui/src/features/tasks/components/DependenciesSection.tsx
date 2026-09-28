import { useState } from "react";
import type { TaskDependencyType, TaskWithRepositories } from "@kompanion/shared";
import {
  useAddTaskDependency,
  useRemoveTaskDependency,
  useTaskDependencies,
} from "../hooks.js";

const DEPENDENCY_TYPES: TaskDependencyType[] = [
  "blocked_by",
  "depends_on",
  "relates_to",
];

export function DependenciesSection({
  teamId,
  task,
  allTasks,
}: {
  teamId: string;
  task: TaskWithRepositories;
  allTasks: TaskWithRepositories[];
}) {
  const [relatedTaskId, setRelatedTaskId] = useState("");
  const [depType, setDepType] = useState<TaskDependencyType>("blocked_by");

  const dependencies = useTaskDependencies(teamId, task.id);
  const addDependency = useAddTaskDependency(teamId, task.id);
  const removeDependency = useRemoveTaskDependency(teamId, task.id);

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
            if (!relatedTaskId) return;
            addDependency.mutate(
              { relatedTaskId, type: depType },
              { onSuccess: () => setRelatedTaskId("") },
            );
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
