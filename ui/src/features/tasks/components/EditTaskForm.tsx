import { useState } from "react";
import type { Repository, TaskType, TaskWithRepositories } from "@kompanion/shared";
import { Button, Card, TextArea, TextInput } from "@/shared/ui/index.js";
import { useDeleteTask, useSaveTask } from "../hooks.js";
import { RepositoryCheckboxes } from "./RepositoryCheckboxes.js";
import { TaskTypeSelect } from "./TaskTypeSelect.js";

export function EditTaskForm({
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
  const [title, setTitle] = useState(task.title);
  const [type, setType] = useState<TaskType>(task.type);
  const [description, setDescription] = useState(task.description ?? "");
  const [repositoryIds, setRepositoryIds] = useState(repositories.map((r) => r.id));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = useSaveTask(teamId);
  const deleteTask = useDeleteTask(teamId);

  return (
    <Card
      as="form"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        save.mutate(
          {
            taskId: task.id,
            input: { title, type, description: description || null },
            repositoryIds,
            originalRepositoryIds: repositories.map((r) => r.id),
          },
          { onSuccess: onDone },
        );
      }}
    >
      <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
      <TaskTypeSelect value={type} onChange={setType} />
      <TextArea
        density="xs"
        placeholder="Description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <RepositoryCheckboxes
        repositories={allRepositories}
        selectedIds={repositoryIds}
        onChange={setRepositoryIds}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-red-600">Delete this task for good?</span>
            <button
              type="button"
              className="rounded bg-red-600 px-3 py-1 text-xs text-white disabled:opacity-50"
              disabled={deleteTask.isPending}
              onClick={() => deleteTask.mutate(task.id, { onSuccess: onDone })}
            >
              Confirm delete
            </button>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
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
    </Card>
  );
}
