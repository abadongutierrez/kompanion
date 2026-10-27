package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.RepositoryDiff
import com.kompanion.server.domain.model.Task
import java.util.UUID

// Reads what a task's worktrees changed. Read-only: it never creates a
// worktree. Implemented by adapter/outbound/workspace/GitWorktreeDiffs.
interface WorktreeDiffs {
    // Unknown repository ids are skipped.
    fun diffsFor(task: Task, repositoryIds: List<UUID>): List<RepositoryDiff>
}
