package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.TaskStore
import com.kompanion.server.domain.model.Task
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

// Spring Data JDBC for the aggregate, JdbcTemplate for the link table it
// cannot express — the hybrid ARCHITECTURE.md sanctions, confined to this
// package and mapped to domain types before anything crosses the boundary.
@Component
class JdbcTaskStore(
    private val rows: TaskRowRepository,
    private val jdbc: JdbcTemplate,
) : TaskStore {

    override fun findById(id: UUID): Task? = rows.findById(id).orElse(null)?.toDomain()

    override fun save(task: Task): Task = rows.save(task.toRow()).toDomain()

    override fun repositoryIdsFor(taskId: UUID): List<UUID> = jdbc.query(
        "select repository_id from task_repositories where task_id = ?",
        { rs, _ -> UUID.fromString(rs.getString("repository_id")) },
        taskId,
    )
}
