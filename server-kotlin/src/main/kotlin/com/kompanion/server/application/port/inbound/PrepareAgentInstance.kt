package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.AgentInstance
import com.kompanion.server.domain.model.AgentRuntime
import java.util.UUID

// Everything a run needs from its Agent before the CLI starts: build the agent
// instance from the harness and the Agent's skills, and record on the run what
// it was built from.
interface PrepareAgentInstance {
    fun handle(command: PrepareAgentInstanceCommand): PreparedInstance
}

// Plain fields rather than an Agent: the orchestrator that calls this still
// holds the older entity type, and these three are all the build needs.
data class PrepareAgentInstanceCommand(
    val agentId: UUID,
    val runtime: AgentRuntime,
    val harnessPath: String,
    val runId: UUID,
)

data class PreparedInstance(
    val instance: AgentInstance,
    // The stored instance folder the runner copies its working directory from.
    val path: String,
)
