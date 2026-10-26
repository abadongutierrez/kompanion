package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.outbound.ClaudeUsageSource
import com.kompanion.server.application.port.outbound.UsageReading
import com.kompanion.server.domain.model.UsageWindow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
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
        val result = useCase.handle()

        assertEquals(1, source.calls)
        val fiveHour = result.windows.first { it.kind == "five_hour" }
        assertEquals(62.0, fiveHour.utilization)
        assertEquals(resets, fiveHour.resetsAt)
        assertEquals("allowed_warning", fiveHour.status)
        assertEquals(listOf("five_hour", "seven_day"), result.windows.map { it.kind })
    }

    @Test
    fun `rate limit events do not keep the cache from expiring`() {
        val clock = MovableClock(t0)
        val source = CountingSource(UsageReading.Windows(listOf(UsageWindow("seven_day", 31.0, null))))
        val useCase = ClaudeUsageUseCase(source, clock)
        useCase.handle()

        clock.now = t0.plusSeconds(50)
        useCase.handle(UsageWindow("five_hour", 80.0, resets, "allowed"))
        clock.now = t0.plusSeconds(61)
        useCase.handle()

        assertEquals(2, source.calls)
    }

    @Test
    fun `a rate limit event with nothing cached yet still makes a readout`() {
        val useCase = ClaudeUsageUseCase(CountingSource(UsageReading.Unavailable("x")), MovableClock(t0))

        useCase.handle(UsageWindow("five_hour", 90.0, resets, "allowed_warning"))
        val result = useCase.handle()

        assertTrue(result.available)
        assertEquals(90.0, result.windows.single().utilization)
    }

    @Test
    fun `an event status survives the next endpoint refresh, with the endpoint's percent`() {
        val clock = MovableClock(t0)
        val source = CountingSource(UsageReading.Windows(listOf(UsageWindow("five_hour", 97.0, resets))))
        val useCase = ClaudeUsageUseCase(source, clock)
        useCase.handle()

        clock.now = t0.plusSeconds(50)
        useCase.handle(UsageWindow("five_hour", 99.0, resets, "rejected"))
        source.reading = UsageReading.Windows(listOf(UsageWindow("five_hour", 100.0, resets)))
        clock.now = t0.plusSeconds(61)
        val fiveHour = useCase.handle().windows.single()

        assertEquals(2, source.calls)
        assertEquals("rejected", fiveHour.status)
        assertEquals(100.0, fiveHour.utilization)
    }

    @Test
    fun `an event status is dropped once its window resets`() {
        val clock = MovableClock(t0)
        val next = resets.plusSeconds(5 * 3600)
        val source = CountingSource(UsageReading.Windows(listOf(UsageWindow("five_hour", 97.0, resets))))
        val useCase = ClaudeUsageUseCase(source, clock)
        useCase.handle()
        useCase.handle(UsageWindow("five_hour", null, resets, "rejected"))

        // The endpoint already reports the next window.
        source.reading = UsageReading.Windows(listOf(UsageWindow("five_hour", 1.0, next)))
        clock.now = t0.plusSeconds(61)
        assertNull(useCase.handle().windows.single().status)

        // The reset time itself passing drops it too.
        useCase.handle(UsageWindow("five_hour", null, next, "allowed_warning"))
        clock.now = next.plusSeconds(1)
        assertNull(useCase.handle().windows.single().status)
    }

    @Test
    fun `with no reset time known an event status expires after five minutes`() {
        val clock = MovableClock(t0)
        val source = CountingSource(UsageReading.Windows(listOf(UsageWindow("seven_day", 40.0, null))))
        val useCase = ClaudeUsageUseCase(source, clock)
        useCase.handle()
        useCase.handle(UsageWindow("seven_day", null, null, "allowed_warning"))

        clock.now = t0.plusSeconds(61)
        assertEquals("allowed_warning", useCase.handle().windows.single().status)
        clock.now = t0.plusSeconds(301)
        assertNull(useCase.handle().windows.single().status)
    }

    @Test
    fun `an event during an endpoint read neither waits for it nor is lost`() {
        val clock = MovableClock(t0)
        lateinit var useCase: ClaudeUsageUseCase
        var eventReturned = false
        val source = object : ClaudeUsageSource {
            override fun read(): UsageReading {
                // From another thread, as a run's stdout reader would: it
                // must not block on the read in progress.
                val recorder = Thread { useCase.handle(UsageWindow("five_hour", 88.0, resets, "allowed_warning")) }
                recorder.start()
                recorder.join(2_000)
                eventReturned = !recorder.isAlive
                return UsageReading.Windows(listOf(UsageWindow("five_hour", 80.0, resets)))
            }
        }
        useCase = ClaudeUsageUseCase(source, clock)

        val fiveHour = useCase.handle().windows.single()

        assertTrue(eventReturned)
        assertEquals(88.0, fiveHour.utilization)
        assertEquals("allowed_warning", fiveHour.status)
    }
}
