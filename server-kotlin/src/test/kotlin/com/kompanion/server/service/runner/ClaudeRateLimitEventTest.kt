package com.kompanion.server.service.runner

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.time.Instant

// The stream-json rate_limit_event parser against the shapes the research found.
class ClaudeRateLimitEventTest {

    private val mapper = JsonMapper.builder().build()

    @Suppress("UNCHECKED_CAST")
    private fun json(text: String) = mapper.readValue(text, Map::class.java) as Map<String, Any?>

    @Test
    fun `a rate limit event becomes a window, fraction scaled to percent`() {
        val window = parseRateLimitEvent(
            json(
                """{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning",
                    "resetsAt":1761500000,"rateLimitType":"five_hour","utilization":0.82}}""",
            ),
        )!!

        assertEquals("five_hour", window.kind)
        assertEquals(82.0, window.utilization!!, 0.0001)
        assertEquals(Instant.ofEpochSecond(1761500000), window.resetsAt)
        assertEquals("allowed_warning", window.status)
    }

    @Test
    fun `a status-only event keeps utilization null, and other events are ignored`() {
        val statusOnly = parseRateLimitEvent(
            json("""{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","rate_limit_type":"seven_day"}}"""),
        )!!
        assertNull(statusOnly.utilization)
        assertEquals("seven_day", statusOnly.kind)

        assertNull(parseRateLimitEvent(json("""{"type":"assistant"}""")))
    }

    @Test
    fun `an out-of-range epoch reset time reads as unknown instead of throwing`() {
        val window = parseRateLimitEvent(
            json(
                """{"type":"rate_limit_event","rate_limit_info":{"status":"allowed",
                    "resetsAt":${Long.MAX_VALUE},"rateLimitType":"five_hour"}}""",
            ),
        )!!

        assertNull(window.resetsAt)
        assertEquals("allowed", window.status)
    }
}
