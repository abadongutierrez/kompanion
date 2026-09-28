import type { ReactNode } from "react";
import type { Agent } from "@kompanion/shared";
import { AGENT_RUNTIME_LABEL } from "@kompanion/shared";
import { Card } from "@/shared/ui/index.js";

// One agent, as a card. The team panel and the library page render the same
// thing and differ only in the control top-right (Unassign vs. an Edit link)
// and whether the runtime is worth showing — the library is where runtime is
// chosen, the team panel only borrows the agent.
export function AgentCard({
  agent,
  action,
  showRuntime = false,
}: {
  agent: Agent;
  action?: ReactNode;
  showRuntime?: boolean;
}) {
  return (
    <Card tone="soft" className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-800">{agent.title}</span>
        {action}
      </div>
      <p className="text-xs text-neutral-500">
        slug: <code>{agent.slug}</code>
        {showRuntime && (
          <>
            {" · "}
            {AGENT_RUNTIME_LABEL[agent.runtime]}
            {agent.model && (
              <>
                {" · "}
                <code>{agent.model}</code>
              </>
            )}
          </>
        )}
      </p>
      <p className="break-all text-xs text-neutral-400">
        harness: <code>{agent.harnessPath}</code>
      </p>
    </Card>
  );
}
