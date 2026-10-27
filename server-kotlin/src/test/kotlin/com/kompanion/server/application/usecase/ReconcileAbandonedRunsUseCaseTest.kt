package com.kompanion.server.application.usecase

import com.kompanion.server.domain.model.ActiveRun
import com.kompanion.server.fake.InMemoryRunStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

// No Spring context, no database.
class ReconcileAbandonedRunsUseCaseTest {

    @Test
    fun `abandoned runs are failed with a summary that says why`() {
        val run = ActiveRun(
            runId = UUID.randomUUID(),
            taskId = UUID.randomUUID(),
            taskTitle = "Add a Runs tab",
            teamId = UUID.randomUUID(),
            teamName = "Core",
            agentTitle = "Engineer",
            runtime = "claude_code",
            model = null,
            startedAt = OffsetDateTime.now(),
        )
        val store = InMemoryRunStore(listOf(run))

        val closed = ReconcileAbandonedRunsUseCase(store).handle()

        assertEquals(1, closed)
        assertEquals(listOf(ReconcileAbandonedRunsUseCase.SUMMARY), store.failedWith)
    }
}
