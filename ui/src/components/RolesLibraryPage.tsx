import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@kompanion/shared";
import { api } from "../api.js";

// The app-wide Role library — a root-level page like Projects, reachable
// from anywhere via the header nav, not nested inside any specific
// project/team. Roles are created and edited here; a Team's own Roles
// page (inside a project) only handles assigning/unassigning them.
export function RolesLibraryPage() {
  const queryClient = useQueryClient();
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [harnessPath, setHarnessPath] = useState("");
  const [harnessTemplate, setHarnessTemplate] = useState("");

  const roles = useQuery({ queryKey: ["allRoles"], queryFn: api.listAllRoles });

  function resetForm() {
    setEditingRoleId(null);
    setTitle("");
    setSlug("");
    setHarnessPath("");
    setHarnessTemplate("");
  }

  async function startEditing(role: Role) {
    setEditingRoleId(role.id);
    setTitle(role.title);
    setSlug(role.slug);
    setHarnessPath(role.harnessPath);
    const template = await api.getHarnessTemplate(role.id);
    setHarnessTemplate(template.content);
  }

  const saveRole = useMutation({
    mutationFn: async () => {
      if (editingRoleId) {
        const [role] = await Promise.all([
          api.updateRole(editingRoleId, { title, slug, harnessPath }),
          api.updateHarnessTemplate(editingRoleId, harnessTemplate),
        ]);
        return role;
      }
      return api.createRole({ title, harnessPath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allRoles"] });
      resetForm();
    },
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h2 className="text-lg font-semibold">Roles</h2>
        <p className="text-sm text-neutral-500">
          The app-wide role library. Assign roles to a team from within a project's
          Roles page.
        </p>
      </div>

      {(roles.data ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">No roles yet — create the first one below.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {(roles.data ?? []).map((role) => (
            <div
              key={role.id}
              className="space-y-1 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-800">{role.title}</span>
                <button
                  className="text-xs text-neutral-400 hover:text-neutral-700"
                  onClick={() => startEditing(role)}
                >
                  Edit
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                slug: <code>{role.slug}</code>
              </p>
              <p className="break-all text-xs text-neutral-400">
                harness: <code>{role.harnessPath}</code>
              </p>
            </div>
          ))}
        </div>
      )}

      <form
        className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && harnessPath.trim()) saveRole.mutate();
        }}
      >
        <h3 className="text-sm font-medium">
          {editingRoleId ? "Edit role" : "Create a new role"}
        </h3>
        {editingRoleId && (
          <p className="text-xs text-amber-600">
            This role is shared — editing it changes what every team it's assigned to
            sees.
          </p>
        )}
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Role title (e.g. Tech Lead)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {editingRoleId && (
          <input
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            placeholder="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        )}
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Harness folder path"
          value={harnessPath}
          onChange={(e) => setHarnessPath(e.target.value)}
        />
        {editingRoleId && (
          <textarea
            className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
            placeholder="Harness template (CLAUDE.md)"
            rows={10}
            value={harnessTemplate}
            onChange={(e) => setHarnessTemplate(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
            disabled={saveRole.isPending}
          >
            {editingRoleId ? "Save changes" : "Create role"}
          </button>
          {editingRoleId && (
            <button
              type="button"
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100"
              onClick={resetForm}
            >
              Cancel
            </button>
          )}
        </div>

        {saveRole.isError && (
          <p className="text-xs text-red-600">{(saveRole.error as Error).message}</p>
        )}
      </form>
    </main>
  );
}
