package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.Agent
import java.util.UUID

interface AgentStore {

    fun findById(id: UUID): Agent?

    fun findBySlug(slug: String): Agent?

    // Used when checking whether a slug is free for an agent that may
    // already hold it — an update keeping its own slug is not a collision.
    fun findBySlugExcluding(slug: String, excludeAgentId: UUID): Agent?

    fun save(agent: Agent): Agent
}
