package com.kompanion.server.domain.model

import java.time.OffsetDateTime
import java.util.UUID

// An Agent is a definition, not a position on an org chart: a title, a
// stable slug, the harness folder it runs out of, and which CLI runs it.
// Agents are app-wide — no project or team ownership.
data class Agent(
    val id: UUID? = null,
    val title: String,
    // The only stable, machine-usable identifier an Agent has (the Project
    // Manager team-snapshot gate keys off slug == "project-manager").
    // Unique app-wide.
    val slug: String,
    // Absolute, or relative to the server's workspace root. Resolving it is
    // an adapter's job — the domain only knows there is one.
    val harnessPath: String,
    val runtime: AgentRuntime = AgentRuntime.claude_code,
    // null means "whatever that CLI defaults to". Free text: the id formats
    // differ per runtime (claude-opus-5 vs lmstudio/qwen3.8-27b).
    val model: String? = null,
    val createdAt: OffsetDateTime? = null,
)

// Which CLI runs an Agent. Lowercase constants for the same reason
// TaskStatus's are: they are the text stored in the column.
enum class AgentRuntime { claude_code, opencode, pi }
