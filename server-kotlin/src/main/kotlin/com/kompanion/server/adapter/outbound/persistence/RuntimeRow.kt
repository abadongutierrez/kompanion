package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.ListCrudRepository
import java.time.OffsetDateTime
import java.util.UUID

@Table("runtimes")
data class RuntimeRow(
    @Id val id: UUID? = null,
    val name: String,
    val kind: AgentRuntime,
    val binaryPath: String? = null,
    val configDir: String? = null,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)

interface RuntimeRowRepository : ListCrudRepository<RuntimeRow, UUID> {
    fun findAllByOrderByName(): List<RuntimeRow>
}

fun RuntimeRow.toDomain(): Runtime = Runtime(id, name, kind, binaryPath, configDir, createdAt)

fun Runtime.toRow(): RuntimeRow = RuntimeRow(id, name, kind, binaryPath, configDir, createdAt)
