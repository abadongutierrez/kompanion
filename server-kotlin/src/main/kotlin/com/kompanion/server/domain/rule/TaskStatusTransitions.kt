package com.kompanion.server.domain.rule

import com.kompanion.server.domain.model.TaskStatus

// Direct port of packages/shared/src/domain.ts's TASK_STATUS_TRANSITIONS /
// isValidTaskTransition. "blocked" can be entered from or exited back to
// any non-terminal status, so it isn't a linear step.
val TASK_STATUS_TRANSITIONS: Map<TaskStatus, List<TaskStatus>> = mapOf(
    TaskStatus.backlog to listOf(TaskStatus.in_progress),
    TaskStatus.in_progress to listOf(TaskStatus.in_review, TaskStatus.blocked, TaskStatus.backlog),
    TaskStatus.in_review to listOf(TaskStatus.done, TaskStatus.in_progress, TaskStatus.blocked),
    TaskStatus.blocked to listOf(TaskStatus.in_progress, TaskStatus.in_review, TaskStatus.backlog),
    TaskStatus.done to emptyList(),
)

fun isValidTaskTransition(from: TaskStatus, to: TaskStatus): Boolean {
    if (from == to) return true
    return TASK_STATUS_TRANSITIONS[from]?.contains(to) ?: false
}
