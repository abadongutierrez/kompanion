package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.UpdateAgent
import com.kompanion.server.application.port.inbound.UpdateAgentCommand
import com.kompanion.server.application.port.outbound.AgentStore
import com.kompanion.server.application.port.outbound.Harnesses
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Agent
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class UpdateAgentUseCase(
    private val agents: AgentStore,
    private val harnesses: Harnesses,
) : UpdateAgent {

    @Transactional
    override fun handle(command: UpdateAgentCommand): Agent {
        val existing = agents.findById(command.agentId)
            ?: throw DomainException.NotFound("agent not found")

        val runtime = command.runtime ?: existing.runtime
        val harnessPath = command.harnessPath ?: existing.harnessPath

        // Re-validate whenever either half of (path, runtime) changes — a
        // .claude/-only harness stops being valid the moment the Agent
        // switches to opencode, and saying so now beats failing at run time.
        if (command.harnessPath != null || command.runtime != null) {
            harnesses.validate(runtime, harnessPath)?.let { throw DomainException.Invalid(it) }
        }

        // Unlike creation, editing never silently re-derives the slug from a
        // title change — it is only touched when explicitly provided, and
        // then it must be free, because callers key off it.
        command.slug?.let { slug ->
            if (agents.findBySlugExcluding(slug, command.agentId) != null) {
                throw DomainException.Conflict("slug \"$slug\" is already used by another agent")
            }
        }

        return agents.save(
            existing.copy(
                title = command.title ?: existing.title,
                slug = command.slug ?: existing.slug,
                harnessPath = command.harnessPath?.let { harnesses.normalizePath(it) }
                    ?: existing.harnessPath,
                runtime = runtime,
                // Blank clears it back to the CLI default; absent leaves it
                // alone.
                model = command.model?.ifBlank { null } ?: existing.model.takeIf { command.model == null },
            ),
        )
    }
}
