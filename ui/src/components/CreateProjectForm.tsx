import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@sdlc/shared";
import { api } from "../api.js";

export function CreateProjectForm({
  onCreated,
}: {
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.createProject({ name }),
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
