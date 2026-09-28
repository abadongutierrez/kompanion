import { useState } from "react";
import type { Project } from "@kompanion/shared";
import { Button, Muted, TextInput } from "@/shared/ui/index.js";
import { useCreateProject } from "../hooks.js";

export function CreateProjectForm({
  onCreated,
}: {
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");

  const createProject = useCreateProject();

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        // Blank workspace means "you pick": the server puts the folder under
        // its own workspace root and names it after the project.
        createProject.mutate(
          { name, workspacePath: workspacePath.trim() || undefined },
          { onSuccess: onCreated },
        );
      }}
    >
      <h2 className="text-base font-medium">Create a Project</h2>
      <TextInput
        density="md"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextInput
        density="md"
        placeholder="Workspace folder (optional)"
        aria-label="Workspace folder"
        value={workspacePath}
        onChange={(e) => setWorkspacePath(e.target.value)}
      />
      <Muted size="xs">
        Where this project's tasks get their workspaces. Leave blank to use a folder under the
        server's workspace root.
      </Muted>
      <Button type="submit" density="md" disabled={createProject.isPending}>
        Create
      </Button>
    </form>
  );
}
