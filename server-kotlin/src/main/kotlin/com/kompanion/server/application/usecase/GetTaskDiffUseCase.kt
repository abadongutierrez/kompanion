package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.GetTaskDiff
import com.kompanion.server.application.port.outbound.TaskStore
import com.kompanion.server.application.port.outbound.WorktreeDiffs
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.RepositoryDiff
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class GetTaskDiffUseCase(
    private val tasks: TaskStore,
    private val diffs: WorktreeDiffs,
) : GetTaskDiff {

    override fun handle(taskId: UUID): List<RepositoryDiff> {
        val task = tasks.findById(taskId) ?: throw DomainException.NotFound("task not found")
        val repositoryIds = tasks.repositoryIdsFor(taskId)
        if (repositoryIds.isEmpty()) return emptyList()
        return diffs.diffsFor(task, repositoryIds)
    }
}
