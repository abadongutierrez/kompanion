package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.TaskWithRepositories
import com.kompanion.server.application.port.inbound.UpdateTaskStatus
import com.kompanion.server.application.port.inbound.UpdateTaskStatusCommand
import com.kompanion.server.dto.TaskWithRepositoriesResponse
import com.kompanion.server.dto.UpdateTaskStatusRequest
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

// The first endpoint migrated to the layout in ARCHITECTURE.md, and the
// shape the rest are meant to copy: deserialize, map to a command, call one
// use case, map the result. Refusals travel as DomainExceptions and are
// turned into status codes by DomainExceptionHandler.
//
// It sits beside the legacy TaskController on the same base path — which is
// legal as long as no route is duplicated — and that controller loses this
// one method. When its last endpoint moves here, it is deleted.
//
// The wire DTOs still live in dto/; that package moves under this one in a
// later slice, and moving it now would touch every controller for no gain.
@RestController
@RequestMapping("/api/teams/{teamId}/tasks")
class TaskStatusController(private val updateTaskStatus: UpdateTaskStatus) {

    @PatchMapping("/{taskId}/status")
    fun updateStatus(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @RequestBody body: UpdateTaskStatusRequest,
    ): TaskWithRepositoriesResponse =
        updateTaskStatus.handle(UpdateTaskStatusCommand(taskId, body.status)).toResponse()
}

// Domain -> wire. Separate types on purpose: a domain refactor must not be
// able to silently reshape a JSON payload the UI depends on.
internal fun TaskWithRepositories.toResponse() = TaskWithRepositoriesResponse(
    id = task.id!!,
    teamId = task.teamId,
    agentId = task.agentId,
    title = task.title,
    description = task.description,
    type = task.type,
    status = task.status,
    storyPoints = task.storyPoints,
    acceptanceCriteria = task.acceptanceCriteria,
    branchOrPrLink = task.branchOrPrLink,
    runningSince = task.runningSince,
    createdAt = task.createdAt,
    updatedAt = task.updatedAt,
    repositoryIds = repositoryIds,
)
