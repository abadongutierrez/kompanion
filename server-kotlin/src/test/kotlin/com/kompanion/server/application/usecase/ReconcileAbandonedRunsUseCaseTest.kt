package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.ReconcileResult
import com.kompanion.server.application.port.outbound.RunFolders
import com.kompanion.server.domain.model.AbandonedRun
import com.kompanion.server.fake.FakeRunProcesses
import com.kompanion.server.fake.InMemoryRunStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

// No Spring context, no database.
class ReconcileAbandonedRunsUseCaseTest {

    private val now = Instant.parse("2026-10-27T12:00:00Z")

    // Each task works in a folder named after it.
    private val folders = RunFolders { listOf("/work/$it") }

    private fun abandoned(taskId: UUID = UUID.randomUUID(), startedAt: Instant = now) =
        AbandonedRun(UUID.randomUUID(), taskId, startedAt)

    @Test
    fun `runs whose processes are gone are failed with a summary that says why`() {
        val taskId = UUID.randomUUID()
        // Two stale rows on one task: its processes are checked once, from
        // the earlier start.
        val first = abandoned(taskId, now.minusSeconds(60))
        val second = abandoned(taskId)
        val store = InMemoryRunStore(abandoned = listOf(first, second))
        val processes = FakeRunProcesses()

        val result = ReconcileAbandonedRunsUseCase(store, processes, folders).handle()

        assertEquals(ReconcileResult(closed = 2, stillRunning = 0), result)
        assertEquals(
            listOf(first.runId, second.runId).map { it to ReconcileAbandonedRunsUseCase.SUMMARY },
            store.failed,
        )
        assertEquals(listOf(taskId to now.minusSeconds(60)), processes.stopped)
        assertEquals(listOf(listOf("/work/$taskId")), processes.folders)
    }

    @Test
    fun `a run whose processes may still be alive keeps its task`() {
        val survivor = abandoned()
        val gone = abandoned()
        val store = InMemoryRunStore(abandoned = listOf(survivor, gone))

        val result = ReconcileAbandonedRunsUseCase(store, FakeRunProcesses(survivors = setOf(survivor.taskId)), folders)
            .handle()

        assertEquals(ReconcileResult(closed = 1, stillRunning = 1), result)
        assertEquals(listOf(gone.runId to ReconcileAbandonedRunsUseCase.SUMMARY), store.failed)
    }
}
