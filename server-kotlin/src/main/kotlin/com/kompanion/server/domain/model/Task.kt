package com.kompanion.server.domain.model

import java.time.OffsetDateTime
import java.util.UUID

// The Task as the system reasons about it — no @Table, no @Id, nothing that
// would stop this file compiling with Spring and JDBC off the classpath.
// Its persistence shape lives in adapter/outbound/persistence/TaskRow.kt.
//
// id is nullable for the same reason the row's is: it exists only once the
// database has generated it.
data class Task(
    val id: UUID? = null,
    val teamId: UUID,
    val agentId: UUID? = null,
    val title: String,
    val description: String? = null,
    val type: TaskType,
    val status: TaskStatus = TaskStatus.backlog,
    val storyPoints: Int? = null,
    val acceptanceCriteria: String? = null,
    val branchOrPrLink: String? = null,
    // Set while some agent has a live run on this task, cleared when it
    // ends. The one server-side signal that a task is frozen.
    val runningSince: OffsetDateTime? = null,
    val createdAt: OffsetDateTime? = null,
    val updatedAt: OffsetDateTime? = null,
)

// Domain vocabulary, and also what the database stores: the lowercase
// constant names are load-bearing, because Spring Data JDBC persists Kotlin
// enums through name()/valueOf() and the columns hold this exact text.
// Renaming a constant is a schema change.
enum class TaskType { story, bug, chore, spike }

enum class TaskStatus { backlog, in_progress, in_review, blocked, done }

enum class TaskDependencyType { blocked_by, depends_on, relates_to }
