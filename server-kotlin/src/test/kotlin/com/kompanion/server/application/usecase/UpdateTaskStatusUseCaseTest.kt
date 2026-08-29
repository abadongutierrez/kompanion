package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.UpdateTaskStatusCommand
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Task
import com.kompanion.server.domain.model.TaskStatus
import com.kompanion.server.domain.model.TaskType
import com.kompanion.server.fake.InMemoryTaskStore
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertThrows
import java.util.UUID

// No Spring context, no database — which is the whole point of the layout.
class UpdateTaskStatusUseCaseTest {

    private val taskId = UUID.randomUUID()

    private fun task(status: TaskStatus) = Task(
        id = taskId,
        teamId = UUID.randomUUID(),
        title = "Ship it",
        type = TaskType.story,
        status = status,
    )

    @Test
    fun `an allowed transition is saved and returned with the task's repositories`() {
        val repoId = UUID.randomUUID()
        val tasks = InMemoryTaskStore(task(TaskStatus.backlog)).apply { repositoryIds = listOf(repoId) }

        val result = UpdateTaskStatusUseCase(tasks)
            .handle(UpdateTaskStatusCommand(taskId, TaskStatus.in_progress))

        assertEquals(TaskStatus.in_progress, result.task.status)
        assertEquals(listOf(repoId), result.repositoryIds)
        assertEquals(TaskStatus.in_progress, tasks.saved.single().status)
    }

    @Test
    fun `updatedAt is stamped on the way through`() {
        // There is no database trigger for it; every write path has always
        // set it explicitly, and now this is the write path.
        val tasks = InMemoryTaskStore(task(TaskStatus.backlog))

        UpdateTaskStatusUseCase(tasks).handle(UpdateTaskStatusCommand(taskId, TaskStatus.in_progress))

        assertNotNull(tasks.saved.single().updatedAt)
    }

    @Test
    fun `a transition the board forbids is a conflict, and nothing is saved`() {
        val tasks = InMemoryTaskStore(task(TaskStatus.backlog))

        val e = assertThrows<DomainException.Conflict> {
            UpdateTaskStatusUseCase(tasks).handle(UpdateTaskStatusCommand(taskId, TaskStatus.done))
        }

        assertEquals("cannot transition task from backlog to done", e.message)
        assertTrue(tasks.saved.isEmpty())
    }

    @Test
    fun `an unknown task is not found`() {
        val tasks = InMemoryTaskStore()

        assertThrows<DomainException.NotFound> {
            UpdateTaskStatusUseCase(tasks).handle(UpdateTaskStatusCommand(taskId, TaskStatus.in_progress))
        }
    }
}
