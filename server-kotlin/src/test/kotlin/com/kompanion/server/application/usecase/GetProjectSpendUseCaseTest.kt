package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.GetProjectSpendQuery
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.DaySpend
import com.kompanion.server.domain.model.ProjectSpend
import com.kompanion.server.fake.InMemoryProjectStore
import com.kompanion.server.fake.InMemorySpendStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

// No Spring context, no database.
class GetProjectSpendUseCaseTest {

    private val projectId = UUID.randomUUID()

    private val spend = ProjectSpend(
        projectId = projectId,
        totalSpendUsd = BigDecimal("42.13"),
        totalRunCount = 87,
        monthSpendUsd = BigDecimal("6.02"),
        periodStart = OffsetDateTime.now(),
    )

    @Test
    fun `the totals and the day breakdown come back together`() {
        val byDay = listOf(DaySpend("2026-09-06", BigDecimal("1.23"), 4))
        val store = InMemorySpendStore(spend, byDay)

        val result = GetProjectSpendUseCase(InMemoryProjectStore(projectId), store)
            .handle(GetProjectSpendQuery(projectId))

        assertEquals(BigDecimal("42.13"), result.spend.totalSpendUsd)
        assertEquals(87, result.spend.totalRunCount)
        assertEquals(BigDecimal("6.02"), result.spend.monthSpendUsd)
        assertEquals(byDay, result.byDay)
    }

    @Test
    fun `an unknown project is not found, rather than a project that cost nothing`() {
        val store = InMemorySpendStore()

        assertThrows<DomainException.NotFound> {
            GetProjectSpendUseCase(InMemoryProjectStore(), store)
                .handle(GetProjectSpendQuery(projectId))
        }

        assertTrue(store.asked.isEmpty())
    }
}
