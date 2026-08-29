package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.CreateAgent
import com.kompanion.server.application.port.inbound.CreateAgentCommand
import com.kompanion.server.application.port.inbound.UpdateAgent
import com.kompanion.server.application.port.inbound.UpdateAgentCommand
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.dto.CreateAgentRequest
import com.kompanion.server.dto.UpdateAgentRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

// The write half of the agent library. The rules it used to hold — harness
// validation, slug uniqueness, when to re-validate — are now in
// CreateAgentUseCase / UpdateAgentUseCase; GlobalAgentsController keeps the
// endpoints that have not been migrated yet.
@RestController
@RequestMapping("/api/agents")
class AgentWriteController(
    private val createAgent: CreateAgent,
    private val updateAgent: UpdateAgent,
) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody body: CreateAgentRequest): AgentResponse =
        createAgent.handle(
            CreateAgentCommand(
                title = body.title,
                harnessPath = body.harnessPath,
                runtime = parseRuntime(body.runtime),
                model = body.model,
            ),
        ).toResponse()

    @PatchMapping("/{agentId}")
    fun update(
        @PathVariable agentId: UUID,
        @RequestBody body: UpdateAgentRequest,
    ): AgentResponse =
        updateAgent.handle(
            UpdateAgentCommand(
                agentId = agentId,
                title = body.title,
                slug = body.slug,
                harnessPath = body.harnessPath,
                runtime = parseRuntime(body.runtime),
                model = body.model,
            ),
        ).toResponse()

    // Syntactic validation of the wire format, which is the web adapter's
    // job — an unknown runtime is a malformed request, not a domain rule.
    // Rejected by name so the client is told what the accepted values are,
    // rather than letting valueOf throw a 500.
    private fun parseRuntime(raw: String?): AgentRuntime? {
        if (raw == null) return null
        return runCatching { AgentRuntime.valueOf(raw) }.getOrElse {
            throw DomainException.Invalid(
                "unknown runtime \"$raw\" — expected one of ${AgentRuntime.entries.joinToString(", ") { entry -> entry.name }}",
            )
        }
    }
}

// The agent as the UI receives it. Identical in shape to the domain model
// today; a separate type anyway, because it is a contract shared with
// packages/shared and must not move when the domain does.
data class AgentResponse(
    val id: UUID,
    val title: String,
    val slug: String,
    val harnessPath: String,
    val runtime: AgentRuntime,
    val model: String?,
    val createdAt: OffsetDateTime?,
)

internal fun Agent.toResponse() = AgentResponse(
    id = id!!,
    title = title,
    slug = slug,
    harnessPath = harnessPath,
    runtime = runtime,
    model = model,
    createdAt = createdAt,
)
