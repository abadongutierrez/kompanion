package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import java.util.UUID

// Add an Agent to the app-wide library.
interface CreateAgent {
    fun handle(command: CreateAgentCommand): Agent
}

data class CreateAgentCommand(
    val title: String,
    val harnessPath: String,
    // null means "the default runtime", not "unchanged" — this is a create.
    val runtime: AgentRuntime?,
    val model: String?,
)

// Edit one. Every field is nullable with the same meaning: absent leaves the
// current value alone. The one exception is model, where a blank string
// clears it back to the CLI default — that distinction is why the command
// keeps the raw string instead of a pre-resolved value.
interface UpdateAgent {
    fun handle(command: UpdateAgentCommand): Agent
}

data class UpdateAgentCommand(
    val agentId: UUID,
    val title: String? = null,
    val slug: String? = null,
    val harnessPath: String? = null,
    val runtime: AgentRuntime? = null,
    val model: String? = null,
)
