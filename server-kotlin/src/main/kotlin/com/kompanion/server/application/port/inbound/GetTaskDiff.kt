package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.RepositoryDiff
import java.util.UUID

// The local diff of a task: one entry per linked repository.
interface GetTaskDiff {
    fun handle(taskId: UUID): List<RepositoryDiff>
}
