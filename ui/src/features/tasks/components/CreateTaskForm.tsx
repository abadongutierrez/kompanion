import { useState } from "react";
import type { Agent, Repository, TaskType } from "@kompanion/shared";
import { Button, Card, Select, TextArea, TextInput } from "@/shared/ui/index.js";
import { useCreateTask } from "../hooks.js";
import { RepositoryCheckboxes } from "./RepositoryCheckboxes.js";
import { TaskTypeSelect } from "./TaskTypeSelect.js";

export function CreateTaskForm({
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>("story");
  const [agentId, setAgentId] = useState("");
  const [repositoryIds, setRepositoryIds] = useState<string[]>([]);

  const createTask = useCreateTask(teamId);

  return (
    <Card
      as="form"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        createTask.mutate(
          {
            title,
            type,
            description: description || null,
            agentId: agentId || null,
            repositoryIds,
          },
          { onSuccess: onCreated },
        );
      }}
    >
      <TextInput
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TaskTypeSelect value={type} onChange={setType} />
      <Select
        fullWidth={false}
        density="xs"
        value={agentId}
        onChange={(e) => setAgentId(e.target.value)}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.title}
          </option>
        ))}
      </Select>
      <TextArea
        density="xs"
        placeholder="Description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <RepositoryCheckboxes
        repositories={repositories}
        selectedIds={repositoryIds}
        onChange={setRepositoryIds}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={createTask.isPending}>
          Create task
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
