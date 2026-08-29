package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.CreateAgent
import com.kompanion.server.application.port.inbound.CreateAgentCommand
import com.kompanion.server.application.port.outbound.AgentStore
import com.kompanion.server.application.port.outbound.Harnesses
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class CreateAgentUseCase(
    private val agents: AgentStore,
    private val harnesses: Harnesses,
) : CreateAgent {

    @Transactional
    override fun handle(command: CreateAgentCommand): Agent {
        val runtime = command.runtime ?: AgentRuntime.claude_code

        // No scaffolding happens here — the operator is expected to have
        // created the harness directory already. We only check it is really
        // there and really usable by this runtime.
        harnesses.validate(runtime, command.harnessPath)?.let { throw DomainException.Invalid(it) }

        return agents.save(
            Agent(
                title = command.title,
                slug = uniqueSlug(agents, command.title),
                harnessPath = harnesses.normalizePath(command.harnessPath),
                runtime = runtime,
                // Blank is the same as absent on create: no model means
                // "whatever the CLI defaults to".
                model = command.model?.ifBlank { null },
            ),
        )
    }
}

// Shared with UpdateAgentUseCase. An Agent's slug is unique app-wide, and a
// collision appends -2, -3, … rather than failing: the operator asked for a
// title, not a slug, so there is nothing for them to fix.
internal fun uniqueSlug(agents: AgentStore, title: String, excludeAgentId: java.util.UUID? = null): String {
    val base = slugify(title).ifEmpty { "agent" }
    var candidate = base
    var suffix = 2
    while (true) {
        val existing = if (excludeAgentId != null) {
            agents.findBySlugExcluding(candidate, excludeAgentId)
        } else {
            agents.findBySlug(candidate)
        }
        if (existing == null) return candidate
        candidate = "$base-$suffix"
        suffix += 1
    }
}

internal fun slugify(title: String): String =
    title.lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .replace(Regex("(^-|-$)"), "")
