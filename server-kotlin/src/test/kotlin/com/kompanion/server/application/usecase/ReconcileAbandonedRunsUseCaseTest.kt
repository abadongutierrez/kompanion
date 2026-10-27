package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.ReconcileResult
import com.kompanion.server.domain.model.AbandonedRun
import com.kompanion.server.domain.model.RunProcess
import com.kompanion.server.fake.FakeRunProcesses
import com.kompanion.server.fake.InMemoryRunStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

// No Spring context, no database.
class ReconcileAbandonedRunsUseCaseTest {

    private fun abandoned(pid: Long?) = AbandonedRun(
        runId = UUID.randomUUID(),
        taskId = UUID.randomUUID(),
        process = pid?.let { RunProcess(it, Instant.now()) },
    )

    @Test
    fun `runs whose process is gone are failed with a summary that says why`() {
        val stopped = abandoned(pid = 100)
        val neverStarted = abandoned(pid = null)
        val store = InMemoryRunStore(abandoned = listOf(stopped, neverStarted))
        val processes = FakeRunProcesses()

        val result = ReconcileAbandonedRunsUseCase(store, processes).handle()

        assertEquals(ReconcileResult(closed = 2, stillRunning = 0), result)
        assertEquals(
            listOf(stopped.runId, neverStarted.runId).map { it to ReconcileAbandonedRunsUseCase.SUMMARY },
            store.failed,
        )
        assertEquals(listOf(stopped.process), processes.stopped)
    }

    @Test
    fun `a run whose process may still be alive keeps its task`() {
        val survivor = abandoned(pid = 200)
        val store = InMemoryRunStore(abandoned = listOf(survivor))

        val result = ReconcileAbandonedRunsUseCase(store, FakeRunProcesses(survivors = setOf(200))).handle()

        assertEquals(ReconcileResult(closed = 0, stillRunning = 1), result)
        assertEquals(emptyList<Pair<UUID, String>>(), store.failed)
    }
}
