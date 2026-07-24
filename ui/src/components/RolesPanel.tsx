import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@sdlc/shared";
import { api } from "../api.js";

export function RolesPanel({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [harnessPath, setHarnessPath] = useState("");

  const roles = useQuery({
    queryKey: ["roles", teamId],
    queryFn: () => api.listRoles(teamId),
  });

  const builtinHarnesses = useQuery({
    queryKey: ["builtinHarnesses"],
    queryFn: () => api.listBuiltinHarnesses(),
  });

  function resetForm() {
    setEditingRoleId(null);
    setTitle("");
    setHarnessPath("");
  }

  function startEditing(role: Role) {
    setEditingRoleId(role.id);
    setTitle(role.title);
    setHarnessPath(role.harnessPath);
  }

  const seedRoles = useMutation({
    mutationFn: async () => {
      for (const harness of builtinHarnesses.data ?? []) {
        await api.createRole({ teamId, title: harness.title, harnessPath: harness.path });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roles", teamId] }),
  });

  const saveRole = useMutation({
    mutationFn: () =>
      editingRoleId
        ? api.updateRole(teamId, editingRoleId, { title, harnessPath })
        : api.createRole({ teamId, title, harnessPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", teamId] });
      resetForm();
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase text-neutral-500">Roles</h2>

      <form
        className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && harnessPath.trim()) saveRole.mutate();
        }}
      >
        <h3 className="text-sm font-medium">
          {editingRoleId ? "Edit role" : "New role"}
        </h3>
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Role title (e.g. Tech Lead)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Harness folder path"
          value={harnessPath}
          onChange={(e) => setHarnessPath(e.target.value)}
        />
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
          {!editingRoleId && (roles.data ?? []).length === 0 && (builtinHarnesses.data ?? []).length > 0 && (
            <button
              type="button"
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
              disabled={seedRoles.isPending}
              onClick={() => seedRoles.mutate()}
            >
              Seed from built-ins (
              {(builtinHarnesses.data ?? []).map((h) => h.title).join(", ")})
            </button>
          )}
        </div>

        {saveRole.isError && (
          <p className="text-xs text-red-600">{(saveRole.error as Error).message}</p>
        )}
      </form>

      {(roles.data ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">No roles yet on this team.</p>
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
    </div>
  );
}
