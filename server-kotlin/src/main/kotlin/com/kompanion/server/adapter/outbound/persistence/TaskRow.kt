package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.domain.model.Task
import com.kompanion.server.domain.model.TaskStatus
import com.kompanion.server.domain.model.TaskType
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.ListCrudRepository
import java.time.OffsetDateTime
import java.util.UUID

// The tasks table as Spring Data JDBC sees it. Deliberately a separate type
// from domain/model/Task even though the fields currently line up: this is
// where the schema's concerns live (@ReadOnlyProperty on a DB-defaulted
// column, a null id meaning "insert"), and the domain should never grow them.
//
// Coexists with entity/TaskEntities.kt's Task while the remaining task
// endpoints are migrated; that one goes away with the last of them.
@Table("tasks")
data class TaskRow(
    @Id val id: UUID? = null,
    val teamId: UUID,
    val agentId: UUID? = null,
    val title: String,
    val description: String? = null,
    val type: TaskType,
    val status: TaskStatus = TaskStatus.backlog,
    val storyPoints: Int? = null,
    val acceptanceCriteria: String? = null,
    val branchOrPrLink: String? = null,
    val runningSince: OffsetDateTime? = null,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
    val updatedAt: OffsetDateTime? = null,
)

interface TaskRowRepository : ListCrudRepository<TaskRow, UUID>

fun TaskRow.toDomain(): Task = Task(
    id = id,
    teamId = teamId,
    agentId = agentId,
    title = title,
    description = description,
    type = type,
    status = status,
    storyPoints = storyPoints,
    acceptanceCriteria = acceptanceCriteria,
    branchOrPrLink = branchOrPrLink,
    runningSince = runningSince,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun Task.toRow(): TaskRow = TaskRow(
    id = id,
    teamId = teamId,
    agentId = agentId,
    title = title,
    description = description,
    type = type,
    status = status,
    storyPoints = storyPoints,
    acceptanceCriteria = acceptanceCriteria,
    branchOrPrLink = branchOrPrLink,
    runningSince = runningSince,
    createdAt = createdAt,
    updatedAt = updatedAt,
)
