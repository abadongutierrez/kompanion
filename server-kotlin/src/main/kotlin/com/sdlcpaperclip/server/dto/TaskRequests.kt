package com.sdlcpaperclip.server.dto

import com.sdlcpaperclip.server.entity.TaskDependencyType
import com.sdlcpaperclip.server.entity.TaskStatus
import com.sdlcpaperclip.server.entity.TaskType
import java.time.OffsetDateTime
import java.util.UUID

data class CreateTaskRequest(
    val title: String,
    val type: TaskType,
    val roleId: UUID? = null,
    val repositoryIds: List<UUID>? = null,
    val description: String? = null,
    val storyPoints: Int? = null,
    val acceptanceCriteria: String? = null,
)

data class UpdateTaskStatusRequest(val status: TaskStatus)

data class UpdateTaskRequest(
    val title: String? = null,
    val type: TaskType? = null,
    val description: String? = null,
    val storyPoints: Int? = null,
    val acceptanceCriteria: String? = null,
)

data class AssignRoleRequest(val roleId: UUID? = null)

data class LinkRepositoryRequest(val repositoryId: UUID)

// Hand-rolled response shape (not the Spring Data JDBC Task entity
// directly) — repositoryIds comes from an array_agg join across
// task_repositories, which doesn't fit a single-aggregate entity mapping.
data class TaskWithRepositoriesResponse(
    val id: UUID,
    val teamId: UUID,
    val roleId: UUID?,
    val title: String,
    val description: String?,
    val type: TaskType,
    val status: TaskStatus,
    val storyPoints: Int?,
    val acceptanceCriteria: String?,
    val branchOrPrLink: String?,
    val runningSince: OffsetDateTime?,
    val createdAt: OffsetDateTime?,
    val updatedAt: OffsetDateTime?,
    val repositoryIds: List<UUID>,
)

data class CreateTaskDependencyRequest(val relatedTaskId: UUID, val type: TaskDependencyType)

data class TaskDependencyResponse(
    val id: UUID,
    val taskId: UUID,
    val relatedTaskId: UUID,
    val relatedTaskTitle: String?,
    val type: TaskDependencyType,
    val createdAt: OffsetDateTime?,
)

data class CreateTaskCommentRequest(val roleId: UUID? = null, val body: String)

data class MentionedRoleResponse(val id: UUID, val title: String, val slug: String)

data class TaskCommentResponse(
    val id: UUID,
    val taskId: UUID,
    val roleId: UUID?,
    val authorTitle: String?,
    val body: String,
    val mentionedRoles: List<MentionedRoleResponse>,
    val createdAt: OffsetDateTime?,
)
