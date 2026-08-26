package com.kompanion.server.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.relational.core.mapping.Table
import java.time.OffsetDateTime
import java.util.UUID

// Enum constant names are lowercase-with-underscores deliberately — Spring
// Data JDBC persists Kotlin enums via name()/valueOf() by default, so the
// constant names must match this schema's text values verbatim
// (TaskStatus.in_progress <-> the stored string "in_progress").
enum class TaskType { story, bug, chore, spike }

enum class TaskStatus { backlog, in_progress, in_review, blocked, done }

enum class TaskDependencyType { blocked_by, depends_on, relates_to }

// updatedAt is NOT @ReadOnlyProperty (unlike createdAt) — every write path
// explicitly sets it to "now" in application code, mirroring the original
// SQL's explicit `updated_at = now()` on every UPDATE (there's no DB-side
// trigger for it). status also gets an explicit default matching the
// column's own DB default, applied the same way at insert time either way.
@Table("tasks")
data class Task(
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

@Table("task_dependencies")
data class TaskDependency(
    @Id val id: UUID? = null,
    val taskId: UUID,
    val relatedTaskId: UUID,
    val type: TaskDependencyType,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)

@Table("task_comments")
data class TaskComment(
    @Id val id: UUID? = null,
    val taskId: UUID,
    val agentId: UUID? = null,
    val body: String,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
    // Null until an operator edits the comment.
    val updatedAt: OffsetDateTime? = null,
)
