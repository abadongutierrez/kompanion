package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.GetTaskDiff
import com.kompanion.server.domain.model.RepositoryDiff
import com.kompanion.server.dto.RepositoryDiffResponse
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

// The task page's Diff tab: the worktree of each linked repository compared
// with the branch it was cut from.
@RestController
@RequestMapping("/api/teams/{teamId}/tasks")
class TaskDiffController(private val getTaskDiff: GetTaskDiff) {

    @GetMapping("/{taskId}/diff")
    fun diff(@PathVariable teamId: UUID, @PathVariable taskId: UUID): List<RepositoryDiffResponse> =
        getTaskDiff.handle(taskId).map { it.toResponse() }
}

internal fun RepositoryDiff.toResponse() = RepositoryDiffResponse(
    repositoryId = repositoryId,
    repositoryName = repositoryName,
    baseBranch = baseBranch,
    branch = branch,
    worktreeExists = worktreeExists,
    mergeBase = mergeBase,
    diff = diff,
    truncated = truncated,
    shortStat = shortStat,
    untrackedFiles = untrackedFiles,
    error = error,
)
