import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Muted,
  SectionHeading,
  Select,
} from "@/shared/ui/index.js";
import {
  useAgentLibrary,
  useAssignAgent,
  useBuiltinHarnesses,
  useSeedAgentsFromBuiltins,
  useTeamAgents,
  useUnassignAgent,
} from "../hooks.js";
import { AgentCard } from "./AgentCard.js";

// Assignment-only: Agents are created/edited in the app-wide agent library
// (see AgentsLibraryPage, at /agents) — a Team's Agents page just picks
// which of those agents this team currently has.
export function AgentsPanel({ teamId }: { teamId: string }) {
  const [assignAgentId, setAssignAgentId] = useState("");

  const teamAgents = useTeamAgents(teamId);
  const library = useAgentLibrary();
  const builtinHarnesses = useBuiltinHarnesses();

  const assignAgent = useAssignAgent(teamId);
  const unassignAgent = useUnassignAgent(teamId);
  const seedAgents = useSeedAgentsFromBuiltins(teamId);

  const assigned = teamAgents.data ?? [];
  const harnesses = builtinHarnesses.data ?? [];
  const assignedIds = new Set(assigned.map((a) => a.id));
  const unassignedAgents = (library.data ?? []).filter((a) => !assignedIds.has(a.id));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading>Agents assigned to this team</SectionHeading>
          <Link to="/agents" className="text-xs text-neutral-500 underline hover:text-neutral-700">
            Manage agent library
          </Link>
        </div>
        {assigned.length === 0 ? (
          <Muted>
            No agents assigned to this team yet — assign one below, or{" "}
            <Link to="/agents/new" className="underline">
              create one in the agent library
            </Link>
            .
          </Muted>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {assigned.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                action={
                  <button
                    className="text-xs text-neutral-400 hover:text-red-600"
                    disabled={unassignAgent.isPending}
                    onClick={() => unassignAgent.mutate(agent.id)}
                  >
                    Unassign
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>

      <Card className="space-y-2">
        <h3 className="text-sm font-medium">Assign an agent from the library</h3>
        {unassignedAgents.length === 0 ? (
          <Muted size="xs">Every agent in the library is already assigned to this team.</Muted>
        ) : (
          <div className="flex gap-2">
            <Select
              fullWidth={false}
              className="flex-1"
              value={assignAgentId}
              onChange={(e) => setAssignAgentId(e.target.value)}
            >
              <option value="">Select an agent…</option>
              {unassignedAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.title} ({agent.slug})
                </option>
              ))}
            </Select>
            <Button
              disabled={!assignAgentId || assignAgent.isPending}
              onClick={() =>
                assignAgent.mutate(assignAgentId, {
                  onSuccess: () => setAssignAgentId(""),
                })
              }
            >
              Assign
            </Button>
          </div>
        )}
        {assigned.length === 0 && harnesses.length > 0 && (
          <Button
            variant="secondary"
            disabled={seedAgents.isPending}
            onClick={() =>
              seedAgents.mutate({ harnesses, library: library.data ?? [] })
            }
          >
            Seed from built-ins ({harnesses.map((h) => h.title).join(", ")})
          </Button>
        )}
      </Card>
    </div>
  );
}
