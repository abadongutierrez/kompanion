import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api.js";

// Assignment-only: Roles are created/edited in the app-wide role library
// (see RolesLibraryPage, at /roles) — a Team's Roles page just picks
// which of those roles this team currently has.
export function RolesPanel({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [assignRoleId, setAssignRoleId] = useState("");

  const teamRoles = useQuery({
    queryKey: ["roles", teamId],
    queryFn: () => api.listRoles(teamId),
  });
  const allRoles = useQuery({ queryKey: ["allRoles"], queryFn: api.listAllRoles });
  const builtinHarnesses = useQuery({
    queryKey: ["builtinHarnesses"],
    queryFn: () => api.listBuiltinHarnesses(),
  });

  const assignedIds = new Set((teamRoles.data ?? []).map((r) => r.id));
  const unassignedRoles = (allRoles.data ?? []).filter((r) => !assignedIds.has(r.id));

  function invalidateRoleQueries() {
    queryClient.invalidateQueries({ queryKey: ["roles", teamId] });
    queryClient.invalidateQueries({ queryKey: ["allRoles"] });
  }

  // "Seed from built-ins" reuses an existing role in the library if one
  // already points at that exact harnessPath (so seeding a second team
  // doesn't duplicate roles the first team already created), otherwise
  // creates it — then assigns either way.
  const seedRoles = useMutation({
    mutationFn: async () => {
      for (const harness of builtinHarnesses.data ?? []) {
        const existing = (allRoles.data ?? []).find((r) => r.harnessPath === harness.path);
        const role = existing ?? (await api.createRole({ title: harness.title, harnessPath: harness.path }));
        await api.assignRole(teamId, { roleId: role.id });
      }
    },
    onSuccess: invalidateRoleQueries,
  });

  const assignExisting = useMutation({
    mutationFn: () => api.assignRole(teamId, { roleId: assignRoleId }),
    onSuccess: () => {
      invalidateRoleQueries();
      setAssignRoleId("");
    },
  });

  const unassignRole = useMutation({
    mutationFn: (roleId: string) => api.unassignRole(teamId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roles", teamId] }),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase text-neutral-500">
            Roles assigned to this team
          </h2>
          <Link to="/roles" className="text-xs text-neutral-500 underline hover:text-neutral-700">
            Manage role library
          </Link>
        </div>
        {(teamRoles.data ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">
            No roles assigned to this team yet — assign one below, or{" "}
            <Link to="/roles" className="underline">
              create one in the role library
            </Link>
            .
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {(teamRoles.data ?? []).map((role) => (
              <div
                key={role.id}
                className="space-y-1 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-800">{role.title}</span>
                  <button
                    className="text-xs text-neutral-400 hover:text-red-600"
                    disabled={unassignRole.isPending}
                    onClick={() => unassignRole.mutate(role.id)}
                  >
                    Unassign
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

      <div className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm">
        <h3 className="text-sm font-medium">Assign a role from the library</h3>
        {unassignedRoles.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Every role in the library is already assigned to this team.
          </p>
        ) : (
          <div className="flex gap-2">
            <select
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
              value={assignRoleId}
              onChange={(e) => setAssignRoleId(e.target.value)}
            >
              <option value="">Select a role…</option>
              {unassignedRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title} ({role.slug})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
              disabled={!assignRoleId || assignExisting.isPending}
              onClick={() => assignExisting.mutate()}
            >
              Assign
            </button>
          </div>
        )}
        {(teamRoles.data ?? []).length === 0 && (builtinHarnesses.data ?? []).length > 0 && (
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
    </div>
  );
}
