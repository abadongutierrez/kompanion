package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.outbound.ClaudeUsageSource
import com.kompanion.server.application.port.outbound.UsageReading
import com.kompanion.server.domain.model.UsageWindow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

// No Spring context, no network.
class ClaudeUsageUseCaseTest {

    private class MovableClock(var now: Instant) : Clock() {
        override fun instant() = now
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?) = this
    }

    private class CountingSource(var reading: UsageReading) : ClaudeUsageSource {
        var calls = 0
        override fun read(): UsageReading {
            calls++
            return reading
        }
    }

    private val t0 = Instant.parse("2026-10-26T12:00:00Z")
    private val resets = Instant.parse("2026-10-26T14:30:00Z")

    @Test
    fun `a reading is cached for sixty seconds, then read again`() {
        val clock = MovableClock(t0)
        val source = CountingSource(UsageReading.Windows(listOf(UsageWindow("five_hour", 62.0, resets))))
        val useCase = ClaudeUsageUseCase(source, clock)

        val first = useCase.handle()
        clock.now = t0.plusSeconds(59)
        useCase.handle()
        assertEquals(1, source.calls)

        clock.now = t0.plusSeconds(61)
        useCase.handle()
        assertEquals(2, source.calls)

        assertTrue(first.available)
        assertEquals(62.0, first.windows.single().utilization)
        assertEquals(t0, first.fetchedAt)
    }

    @Test
    fun `an unavailable source is reported with its reason, not as zero usage`() {
        val useCase = ClaudeUsageUseCase(CountingSource(UsageReading.Unavailable("no credentials")), MovableClock(t0))

        val result = useCase.handle()

        assertFalse(result.available)
        assertEquals("no credentials", result.reason)
        assertTrue(result.windows.isEmpty())
    }

    @Test
    fun `a rate limit event updates the cached window and keeps what it does not carry`() {
        val clock = MovableClock(t0)
        val source = CountingSource(
            UsageReading.Windows(
                listOf(UsageWindow("five_hour", 62.0, resets), UsageWindow("seven_day", 31.0, null)),
            ),
        )
        val useCase = ClaudeUsageUseCase(source, clock)
        useCase.handle()

        clock.now = t0.plusSeconds(50)
        useCase.handle(UsageWindow("five_hour", null, null, status = "allowed_warning"))
        clock.now = t0.plusSeconds(100) // past the original TTL, inside the event's
        val result = useCase.handle()

        assertEquals(1, source.calls)
        val fiveHour = result.windows.first { it.kind == "five_hour" }
        assertEquals(62.0, fiveHour.utilization)
        assertEquals(resets, fiveHour.resetsAt)
        assertEquals("allowed_warning", fiveHour.status)
        assertEquals(listOf("five_hour", "seven_day"), result.windows.map { it.kind })
    }

    @Test
    fun `a rate limit event with nothing cached yet still makes a readout`() {
        val useCase = ClaudeUsageUseCase(CountingSource(UsageReading.Unavailable("x")), MovableClock(t0))

        useCase.handle(UsageWindow("five_hour", 90.0, resets, "allowed_warning"))
        val result = useCase.handle()

        assertTrue(result.available)
        assertEquals(90.0, result.windows.single().utilization)
    }
}
