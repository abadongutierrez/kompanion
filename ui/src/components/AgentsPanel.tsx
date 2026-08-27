import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api.js";

// Assignment-only: Agents are created/edited in the app-wide agent library
// (see AgentsLibraryPage, at /agents) — a Team's Agents page just picks
// which of those agents this team currently has.
export function AgentsPanel({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [assignAgentId, setAssignAgentId] = useState("");

  const teamAgents = useQuery({
    queryKey: ["agents", teamId],
    queryFn: () => api.listAgents(teamId),
  });
  const allAgents = useQuery({ queryKey: ["allAgents"], queryFn: api.listAllAgents });
  const builtinHarnesses = useQuery({
    queryKey: ["builtinHarnesses"],
    queryFn: () => api.listBuiltinHarnesses(),
  });

  const assignedIds = new Set((teamAgents.data ?? []).map((r) => r.id));
  const unassignedAgents = (allAgents.data ?? []).filter((r) => !assignedIds.has(r.id));

  function invalidateAgentQueries() {
    queryClient.invalidateQueries({ queryKey: ["agents", teamId] });
    queryClient.invalidateQueries({ queryKey: ["allAgents"] });
  }

  // "Seed from built-ins" reuses an existing agent in the library if one
  // already points at that exact harnessPath (so seeding a second team
  // doesn't duplicate agents the first team already created), otherwise
  // creates it — then assigns either way.
  const seedAgents = useMutation({
    mutationFn: async () => {
      for (const harness of builtinHarnesses.data ?? []) {
        const existing = (allAgents.data ?? []).find((r) => r.harnessPath === harness.path);
        const agent = existing ?? (await api.createAgent({ title: harness.title, harnessPath: harness.path }));
        await api.assignAgent(teamId, { agentId: agent.id });
      }
    },
    onSuccess: invalidateAgentQueries,
  });

  const assignExisting = useMutation({
    mutationFn: () => api.assignAgent(teamId, { agentId: assignAgentId }),
    onSuccess: () => {
      invalidateAgentQueries();
      setAssignAgentId("");
    },
  });

  const unassignAgent = useMutation({
    mutationFn: (agentId: string) => api.unassignAgent(teamId, agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents", teamId] }),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase text-neutral-500">
            Agents assigned to this team
          </h2>
          <Link to="/agents" className="text-xs text-neutral-500 underline hover:text-neutral-700">
            Manage agent library
          </Link>
        </div>
        {(teamAgents.data ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">
            No agents assigned to this team yet — assign one below, or{" "}
            <Link to="/agents/new" className="underline">
              create one in the agent library
            </Link>
            .
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {(teamAgents.data ?? []).map((agent) => (
              <div
                key={agent.id}
                className="space-y-1 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-800">{agent.title}</span>
                  <button
                    className="text-xs text-neutral-400 hover:text-red-600"
                    disabled={unassignAgent.isPending}
                    onClick={() => unassignAgent.mutate(agent.id)}
                  >
                    Unassign
                  </button>
                </div>
                <p className="text-xs text-neutral-500">
                  slug: <code>{agent.slug}</code>
                </p>
                <p className="break-all text-xs text-neutral-400">
                  harness: <code>{agent.harnessPath}</code>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-sm shadow-sm">
        <h3 className="text-sm font-medium">Assign an agent from the library</h3>
        {unassignedAgents.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Every agent in the library is already assigned to this team.
          </p>
        ) : (
          <div className="flex gap-2">
            <select
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
              value={assignAgentId}
              onChange={(e) => setAssignAgentId(e.target.value)}
            >
              <option value="">Select an agent…</option>
              {unassignedAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.title} ({agent.slug})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
              disabled={!assignAgentId || assignExisting.isPending}
              onClick={() => assignExisting.mutate()}
            >
              Assign
            </button>
          </div>
        )}
        {(teamAgents.data ?? []).length === 0 && (builtinHarnesses.data ?? []).length > 0 && (
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
            disabled={seedAgents.isPending}
            onClick={() => seedAgents.mutate()}
          >
            Seed from built-ins (
            {(builtinHarnesses.data ?? []).map((h) => h.title).join(", ")})
          </button>
        )}
      </div>
    </div>
  );
}
