package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.outbound.WorktreeDiffs
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.RepositoryDiff
import com.kompanion.server.domain.model.Task
import com.kompanion.server.domain.model.TaskType
import com.kompanion.server.fake.InMemoryTaskStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.util.UUID

class GetTaskDiffUseCaseTest {

    private val taskId = UUID.randomUUID()
    private val task = Task(id = taskId, teamId = UUID.randomUUID(), title = "Diff", type = TaskType.story)

    private class RecordingDiffs : WorktreeDiffs {
        val calls = mutableListOf<List<UUID>>()
        override fun diffsFor(task: Task, repositoryIds: List<UUID>): List<RepositoryDiff> {
            calls += repositoryIds
            return repositoryIds.map {
                RepositoryDiff(it, "repo", "main", "feat/x", worktreeExists = false)
            }
        }
    }

    @Test
    fun `returns one diff per linked repository`() {
        val repoId = UUID.randomUUID()
        val tasks = InMemoryTaskStore(task).apply { repositoryIds = listOf(repoId) }
        val diffs = RecordingDiffs()

        val result = GetTaskDiffUseCase(tasks, diffs).handle(taskId)

        assertEquals(listOf(repoId), result.map { it.repositoryId })
        assertEquals(listOf(listOf(repoId)), diffs.calls)
    }

    @Test
    fun `a task with no repositories has no diff and runs no git`() {
        val diffs = RecordingDiffs()

        val result = GetTaskDiffUseCase(InMemoryTaskStore(task), diffs).handle(taskId)

        assertTrue(result.isEmpty())
        assertTrue(diffs.calls.isEmpty())
    }

    @Test
    fun `an unknown task is NotFound`() {
        assertThrows<DomainException.NotFound> {
            GetTaskDiffUseCase(InMemoryTaskStore(), RecordingDiffs()).handle(taskId)
        }
    }
}
