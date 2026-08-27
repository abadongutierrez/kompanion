import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AGENT_RUNTIME_LABEL } from "@kompanion/shared";
import { api } from "../api.js";

// The app-wide Agent library — a root-level page like Projects, reachable
// from anywhere via the header nav, not nested inside any specific
// project/team. This page only lists them: creating and editing happen on
// their own routes (/agents/new and /agents/:agentId, see AgentFormPage). A
// Team's own Agents page (inside a project) only handles
// assigning/unassigning them.
export function AgentsLibraryPage() {
  const agents = useQuery({ queryKey: ["allAgents"], queryFn: api.listAllAgents });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Agents</h2>
          <p className="text-sm text-neutral-500">
            The app-wide agent library. Assign agents to a team from within a project's
            Agents page.
          </p>
        </div>
        <Link
          to="/agents/new"
          className="shrink-0 rounded bg-neutral-900 px-3 py-1 text-xs text-white"
        >
          New agent
        </Link>
      </div>

      {agents.isError && (
        <p className="text-sm text-neutral-600">Could not load the agent library.</p>
      )}

      {(agents.data ?? []).length === 0 ? (
        agents.data && (
          <p className="text-sm text-neutral-500">
            No agents yet —{" "}
            <Link to="/agents/new" className="underline">
              create the first one
            </Link>
            .
          </p>
        )
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {(agents.data ?? []).map((agent) => (
            <div
              key={agent.id}
              className="space-y-1 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-800">{agent.title}</span>
                <Link
                  to={`/agents/${agent.id}`}
                  className="text-xs text-neutral-400 hover:text-neutral-700"
                >
                  Edit
                </Link>
              </div>
              <p className="text-xs text-neutral-500">
                slug: <code>{agent.slug}</code> · {AGENT_RUNTIME_LABEL[agent.runtime]}
                {agent.model && (
                  <>
                    {" · "}
                    <code>{agent.model}</code>
                  </>
                )}
              </p>
              <p className="break-all text-xs text-neutral-400">
                harness: <code>{agent.harnessPath}</code>
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
