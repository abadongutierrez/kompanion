import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@kompanion/shared";
import { api } from "../api.js";

export function CreateProjectForm({
  onCreated,
}: {
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    // Blank means "you pick": the server puts the folder under its own
    // workspace root and names it after the project.
    mutationFn: () =>
      api.createProject({
        name,
        workspacePath: workspacePath.trim() || undefined,
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onCreated(project);
    },
  });

  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) mutation.mutate();
      }}
    >
      <h2 className="text-base font-medium">Create a Project</h2>
      <input
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Workspace folder (optional)"
        aria-label="Workspace folder"
        value={workspacePath}
        onChange={(e) => setWorkspacePath(e.target.value)}
      />
      <p className="text-xs text-neutral-500">
        Where this project's tasks get their workspaces. Leave blank to use a folder under the
        server's workspace root.
      </p>
      <button
        type="submit"
        className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        disabled={mutation.isPending}
      >
        Create
      </button>
    </form>
  );
}
