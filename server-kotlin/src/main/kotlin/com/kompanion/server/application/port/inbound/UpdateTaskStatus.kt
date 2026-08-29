package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.Task
import com.kompanion.server.domain.model.TaskStatus
import java.util.UUID

// Move a task to another status, if the transition table allows it.
interface UpdateTaskStatus {
    fun handle(command: UpdateTaskStatusCommand): TaskWithRepositories
}

data class UpdateTaskStatusCommand(val taskId: UUID, val status: TaskStatus)

// The task plus its linked repository ids. A controller may call exactly one
// use case, and the wire response carries both, so assembling them is the
// use case's job rather than the controller's.
data class TaskWithRepositories(val task: Task, val repositoryIds: List<UUID>)
