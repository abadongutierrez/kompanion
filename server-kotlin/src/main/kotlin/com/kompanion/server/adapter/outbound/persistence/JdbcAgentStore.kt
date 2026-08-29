package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.AgentStore
import com.kompanion.server.domain.model.Agent
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class JdbcAgentStore(private val rows: AgentRowRepository) : AgentStore {

    override fun findById(id: UUID): Agent? = rows.findById(id).orElse(null)?.toDomain()

    override fun findBySlug(slug: String): Agent? = rows.findBySlug(slug)?.toDomain()

    override fun findBySlugExcluding(slug: String, excludeAgentId: UUID): Agent? =
        rows.findBySlugAndIdNot(slug, excludeAgentId)?.toDomain()

    // createdAt is @ReadOnlyProperty (the column defaults to now()), so
    // save() does not read it back — re-fetch, or a freshly created Agent
    // would go out to the client with a null createdAt.
    override fun save(agent: Agent): Agent {
        val saved = rows.save(agent.toRow())
        return rows.findById(saved.id!!).orElse(saved).toDomain()
    }
}
