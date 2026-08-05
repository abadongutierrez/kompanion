import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Repository } from "@kompanion/shared";
import { api } from "../api.js";

export function RepositoriesPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");

  const repositories = useQuery({
    queryKey: ["repositories", projectId],
    queryFn: () => api.listRepositories(projectId),
  });

  function resetForm() {
    setEditingRepoId(null);
    setName("");
    setLocalPath("");
    setDefaultBranch("main");
  }

  function startEditing(repo: Repository) {
    setEditingRepoId(repo.id);
    setName(repo.name);
    setLocalPath(repo.localPath);
    setDefaultBranch(repo.defaultBranch);
  }

  const saveRepository = useMutation({
    mutationFn: () =>
      editingRepoId
        ? api.updateRepository(projectId, editingRepoId, { name, localPath, defaultBranch })
        : api.createRepository({ projectId, name, localPath, defaultBranch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories", projectId] });
      resetForm();
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase text-neutral-500">
        Repositories
      </h2>

      <form
        className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && localPath.trim()) saveRepository.mutate();
        }}
      >
        <h3 className="text-sm font-medium">
          {editingRepoId ? "Edit repository" : "New repository"}
        </h3>
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Local path (already cloned)"
          value={localPath}
          onChange={(e) => setLocalPath(e.target.value)}
        />
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Default branch (e.g. main)"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
            disabled={saveRepository.isPending}
          >
            {editingRepoId ? "Save changes" : "Add repository"}
          </button>
          {editingRepoId && (
            <button
              type="button"
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
              onClick={resetForm}
            >
              Cancel
            </button>
          )}
        </div>

        {saveRepository.isError && (
          <p className="text-xs text-red-600">
            {(saveRepository.error as Error).message}
          </p>
        )}
      </form>

      {(repositories.data ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">No repositories yet on this project.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {(repositories.data ?? []).map((repo) => (
            <div
              key={repo.id}
              className="space-y-1 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-800">{repo.name}</span>
                <button
                  className="text-xs text-neutral-400 hover:text-neutral-700"
                  onClick={() => startEditing(repo)}
                >
                  Edit
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                branch: <code>{repo.defaultBranch}</code>
              </p>
              <p className="break-all text-xs text-neutral-400">
                path: <code>{repo.localPath}</code>
              </p>
              {repo.gitUrl && (
                <p className="break-all text-xs text-neutral-400">
                  url: <code>{repo.gitUrl}</code>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
