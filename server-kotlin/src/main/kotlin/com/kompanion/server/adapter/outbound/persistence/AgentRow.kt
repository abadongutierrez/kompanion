package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.ListCrudRepository
import java.time.OffsetDateTime
import java.util.UUID

// The agents table. Same coexistence note as TaskRow: entity/Entities.kt's
// Agent stays until the last agent endpoint is migrated.
@Table("agents")
data class AgentRow(
    @Id val id: UUID? = null,
    val title: String,
    val slug: String,
    val harnessPath: String,
    val runtime: AgentRuntime = AgentRuntime.claude_code,
    val model: String? = null,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)

interface AgentRowRepository : ListCrudRepository<AgentRow, UUID> {
    fun findBySlug(slug: String): AgentRow?
    fun findBySlugAndIdNot(slug: String, id: UUID): AgentRow?
}

fun AgentRow.toDomain(): Agent = Agent(
    id = id,
    title = title,
    slug = slug,
    harnessPath = harnessPath,
    runtime = runtime,
    model = model,
    createdAt = createdAt,
)

fun Agent.toRow(): AgentRow = AgentRow(
    id = id,
    title = title,
    slug = slug,
    harnessPath = harnessPath,
    runtime = runtime,
    model = model,
    createdAt = createdAt,
)
