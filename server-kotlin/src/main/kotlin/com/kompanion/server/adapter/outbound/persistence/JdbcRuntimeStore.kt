package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.RuntimeStore
import com.kompanion.server.domain.model.Runtime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class JdbcRuntimeStore(
    private val rows: RuntimeRowRepository,
    private val jdbc: JdbcTemplate,
) : RuntimeStore {

    override fun findById(id: UUID): Runtime? = rows.findById(id).orElse(null)?.toDomain()

    override fun findByName(name: String): Runtime? = jdbc.query(
        "select id from runtimes where lower(name) = lower(?)",
        { rs, _ -> rs.getObject("id", UUID::class.java) },
        name,
    ).firstOrNull()?.let { findById(it) }

    override fun findAll(): List<Runtime> = rows.findAllByOrderByName().map { it.toDomain() }

    // createdAt is @ReadOnlyProperty, so save() does not read it back.
    override fun save(runtime: Runtime): Runtime {
        val saved = rows.save(runtime.toRow())
        return rows.findById(saved.id!!).orElse(saved).toDomain()
    }

    override fun delete(id: UUID) = rows.deleteById(id)

    override fun agentTitlesUsing(runtimeId: UUID): List<String> = jdbc.query(
        "select title from agents where runtime_id = ? order by title",
        { rs, _ -> rs.getString("title") },
        runtimeId,
    )
}
