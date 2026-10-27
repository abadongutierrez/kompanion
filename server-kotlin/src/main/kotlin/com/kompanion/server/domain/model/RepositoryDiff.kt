package com.kompanion.server.domain.model

import java.util.UUID

// What a Task changed in one linked repository: its worktree compared with
// the branch the worktree was cut from. worktreeExists is false until the
// Task has run against that repository; the diff fields stay empty then.
data class RepositoryDiff(
    val repositoryId: UUID,
    val repositoryName: String,
    val baseBranch: String,
    val branch: String,
    val worktreeExists: Boolean,
    val mergeBase: String? = null,
    // Unified diff text, committed and uncommitted changes together.
    val diff: String = "",
    // Set when the diff was cut short to keep the response readable.
    val truncated: Boolean = false,
    // git's own one-line summary, e.g. "3 files changed, 10 insertions(+)".
    val shortStat: String? = null,
    // New files git does not track yet, so they are not in the diff text.
    val untrackedFiles: List<String> = emptyList(),
    val error: String? = null,
)
