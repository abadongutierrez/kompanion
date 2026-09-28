import { Link } from "react-router-dom";
import { Muted } from "@/shared/ui/index.js";
import { AgentCard, useAgentLibrary } from "@/features/agents/index.js";

// The app-wide Agent library — a root-level page like Projects, reachable
// from anywhere via the header nav, not nested inside any specific
// project/team. This page only lists them: creating and editing happen on
// their own routes (/agents/new and /agents/:agentId, see AgentFormPage). A
// Team's own Agents page (inside a project) only handles
// assigning/unassigning them.
export function AgentsLibraryPage() {
  const agents = useAgentLibrary();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Agents</h2>
          <Muted>
            The app-wide agent library. Assign agents to a team from within a project's
            Agents page.
          </Muted>
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
          <Muted>
            No agents yet —{" "}
            <Link to="/agents/new" className="underline">
              create the first one
            </Link>
            .
          </Muted>
        )
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {(agents.data ?? []).map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              showRuntime
              action={
                <Link
                  to={`/agents/${agent.id}`}
                  className="text-xs text-neutral-400 hover:text-neutral-700"
                >
                  Edit
                </Link>
              }
            />
          ))}
        </div>
      )}
    </main>
  );
}
