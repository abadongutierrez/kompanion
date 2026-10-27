package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.ReconcileResult
import com.kompanion.server.domain.model.AbandonedRun
import com.kompanion.server.fake.FakeRunProcesses
import com.kompanion.server.fake.InMemoryRunStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

// No Spring context, no database.
class ReconcileAbandonedRunsUseCaseTest {

    private fun abandoned(taskId: UUID = UUID.randomUUID()) = AbandonedRun(UUID.randomUUID(), taskId)

    @Test
    fun `runs whose processes are gone are failed with a summary that says why`() {
        val taskId = UUID.randomUUID()
        // Two stale rows on one task: its processes are checked once.
        val first = abandoned(taskId)
        val second = abandoned(taskId)
        val store = InMemoryRunStore(abandoned = listOf(first, second))
        val processes = FakeRunProcesses()

        val result = ReconcileAbandonedRunsUseCase(store, processes).handle()

        assertEquals(ReconcileResult(closed = 2, stillRunning = 0), result)
        assertEquals(
            listOf(first.runId, second.runId).map { it to ReconcileAbandonedRunsUseCase.SUMMARY },
            store.failed,
        )
        assertEquals(listOf(taskId), processes.stopped)
    }

    @Test
    fun `a run whose processes may still be alive keeps its task`() {
        val survivor = abandoned()
        val gone = abandoned()
        val store = InMemoryRunStore(abandoned = listOf(survivor, gone))

        val result = ReconcileAbandonedRunsUseCase(store, FakeRunProcesses(survivors = setOf(survivor.taskId)))
            .handle()

        assertEquals(ReconcileResult(closed = 1, stillRunning = 1), result)
        assertEquals(listOf(gone.runId to ReconcileAbandonedRunsUseCase.SUMMARY), store.failed)
    }
}
