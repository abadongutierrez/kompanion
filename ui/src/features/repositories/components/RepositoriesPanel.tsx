import { useState } from "react";
import type { Repository } from "@kompanion/shared";
import {
  Button,
  Card,
  ErrorText,
  Muted,
  SectionHeading,
  TextInput,
} from "@/shared/ui/index.js";
import { useRepositories, useSaveRepository } from "../hooks.js";

export function RepositoriesPanel({ projectId }: { projectId: string }) {
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");

  const repositories = useRepositories(projectId);
  const saveRepository = useSaveRepository(projectId);

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

  const repos = repositories.data ?? [];

  return (
    <div className="space-y-4">
      <SectionHeading>Repositories</SectionHeading>

      <Card
        as="form"
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !localPath.trim()) return;
          saveRepository.mutate(
            {
              repositoryId: editingRepoId,
              values: { name, localPath, defaultBranch },
            },
            { onSuccess: resetForm },
          );
        }}
      >
        <h3 className="text-sm font-medium">
          {editingRepoId ? "Edit repository" : "New repository"}
        </h3>
        <TextInput
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextInput
          placeholder="Local path (already cloned)"
          value={localPath}
          onChange={(e) => setLocalPath(e.target.value)}
        />
        <TextInput
          placeholder="Default branch (e.g. main)"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={saveRepository.isPending}>
            {editingRepoId ? "Save changes" : "Add repository"}
          </Button>
          {editingRepoId && (
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>

        {saveRepository.isError && (
          <ErrorText>{(saveRepository.error as Error).message}</ErrorText>
        )}
      </Card>

      {repos.length === 0 ? (
        <Muted>No repositories yet on this project.</Muted>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {repos.map((repo) => (
            <Card key={repo.id} tone="soft" className="space-y-1">
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
