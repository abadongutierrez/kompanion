package com.kompanion.server.domain.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Instant

class ClaudeUsageTest {

    private val t0 = Instant.parse("2026-10-26T12:00:00Z")
    private val resets = Instant.parse("2026-10-26T14:30:00.482Z")
    private val usage = ClaudeUsage(true, null, listOf(UsageWindow("five_hour", 98.0, resets)), t0)

    @Test
    fun `an event for the same reset boundary keeps the known percent, at second precision`() {
        val merged = usage.withWindow(UsageWindow("five_hour", null, Instant.ofEpochSecond(resets.epochSecond), "allowed"), t0)

        val window = merged.windows.single()
        assertEquals(98.0, window.utilization)
        assertEquals("allowed", window.status)
    }

    @Test
    fun `an event with a new reset boundary does not keep the old percent`() {
        val next = resets.plusSeconds(5 * 3600)
        val merged = usage.withWindow(UsageWindow("five_hour", null, next, "allowed"), t0)

        val window = merged.windows.single()
        assertNull(window.utilization)
        assertEquals(next, window.resetsAt)
        assertEquals("allowed", window.status)
    }
}
