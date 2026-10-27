package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.GetActiveRunsQuery
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.ActiveRun
import com.kompanion.server.fake.InMemoryProjectStore
import com.kompanion.server.fake.InMemoryRunStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.OffsetDateTime
import java.util.UUID

// No Spring context, no database.
class GetActiveRunsUseCaseTest {

    private val projectId = UUID.randomUUID()

    @Test
    fun `the project's active runs come back`() {
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

        val result = GetActiveRunsUseCase(InMemoryProjectStore(projectId), store)
            .handle(GetActiveRunsQuery(projectId))

        assertEquals(listOf(run), result)
        assertEquals(listOf(projectId), store.asked)
    }

    @Test
    fun `an unknown project is not found, rather than a project with nothing running`() {
        val store = InMemoryRunStore()

        assertThrows<DomainException.NotFound> {
            GetActiveRunsUseCase(InMemoryProjectStore(), store)
                .handle(GetActiveRunsQuery(projectId))
        }

        assertTrue(store.asked.isEmpty())
    }
}
