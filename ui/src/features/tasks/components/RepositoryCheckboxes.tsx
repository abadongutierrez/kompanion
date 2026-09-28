import type { Repository } from "@kompanion/shared";

// The repo picker shared by the create and edit forms. Renders nothing when
// the project has no repositories, which is what both callers did inline.
export function RepositoryCheckboxes({
  repositories,
  selectedIds,
  onChange,
}: {
  repositories: Repository[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  if (repositories.length === 0) return null;

  function toggle(repoId: string) {
    onChange(
      selectedIds.includes(repoId)
        ? selectedIds.filter((id) => id !== repoId)
        : [...selectedIds, repoId],
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
      <span className="font-medium text-neutral-500">Repos:</span>
      {repositories.map((repo) => (
        <label key={repo.id} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={selectedIds.includes(repo.id)}
            onChange={() => toggle(repo.id)}
          />
          {repo.name}
        </label>
      ))}
    </div>
  );
}
