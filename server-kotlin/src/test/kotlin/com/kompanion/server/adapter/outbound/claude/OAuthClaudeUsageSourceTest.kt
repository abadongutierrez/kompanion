package com.kompanion.server.adapter.outbound.claude

import com.kompanion.server.application.port.outbound.UsageReading
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import tools.jackson.databind.json.JsonMapper
import java.io.File
import java.net.InetSocketAddress
import java.net.URI
import java.time.Instant

// The parsers against the payload shapes the research found, and the source
// against a local HTTP server standing in for api.anthropic.com.
class OAuthClaudeUsageSourceTest {

    private val mapper = JsonMapper.builder().build()
    private var server: HttpServer? = null

    @AfterEach
    fun stop() {
        server?.stop(0)
    }

    @Suppress("UNCHECKED_CAST")
    private fun json(text: String) = mapper.readValue(text, Map::class.java) as Map<String, Any?>

    // -- parseUsageResponse ---------------------------------------------

    @Test
    fun `the older flat shape reads every window object, skipping nulls`() {
        val windows = parseUsageResponse(
            json(
                """{"seven_day":{"utilization":31,"resets_at":"2026-10-30T00:00:00Z"},
                    "five_hour":{"utilization":62.5,"resets_at":"2026-10-26T14:30:00+00:00"},
                    "seven_day_opus":null}""",
            ),
        )

        assertEquals(listOf("five_hour", "seven_day"), windows.map { it.kind })
        assertEquals(62.5, windows[0].utilization)
        assertEquals(Instant.parse("2026-10-26T14:30:00Z"), windows[0].resetsAt)
    }

    @Test
    fun `the newer limits array is read and wins over a flat key`() {
        val windows = parseUsageResponse(
            json(
                """{"five_hour":{"utilization":null,"resets_at":null},
                    "limits":[{"kind":"five_hour","used_percentage":40,"resets_at":"2026-10-26T14:30:00Z"},
                              {"kind":"seven_day_opus","percent":12}]}""",
            ),
        )

        assertEquals(listOf("five_hour", "seven_day_opus"), windows.map { it.kind })
        assertEquals(40.0, windows[0].utilization)
        assertEquals(12.0, windows[1].utilization)
    }

    @Test
    fun `limits kinds are mapped onto the flat window names`() {
        val windows = parseUsageResponse(
            json(
                """{"five_hour":{"utilization":90,"resets_at":null},
                    "limits":[{"kind":"session","percent":97},
                              {"kind":"weekly_all","percent":25},
                              {"kind":"weekly_opus","percent":5}]}""",
            ),
        )

        assertEquals(listOf("five_hour", "seven_day", "seven_day_opus"), windows.map { it.kind })
        assertEquals(listOf(97.0, 25.0, 5.0), windows.map { it.utilization })
    }

    @Test
    fun `flat keys that are not windows, or have no utilization, are skipped`() {
        val windows = parseUsageResponse(
            json(
                """{"seven_day":{"utilization":25},
                    "seven_day_opus":{"utilization":null},
                    "extra_usage":{"is_enabled":true,"utilization":40}}""",
            ),
        )

        assertEquals(listOf("seven_day"), windows.map { it.kind })
    }

    // -- parseRateLimitEvent --------------------------------------------

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

    // -- the source -------------------------------------------------------

    private fun credentials(dir: File, token: String?): File = File(dir, ".credentials.json").apply {
        writeText(if (token == null) """{"other":{}}""" else """{"claudeAiOauth":{"accessToken":"$token"}}""")
    }

    private fun serve(status: Int, body: String, seen: MutableList<Pair<String?, String?>>): URI {
        val s = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        s.createContext("/api/oauth/usage") { ex ->
            seen += ex.requestHeaders.getFirst("Authorization") to ex.requestHeaders.getFirst("anthropic-beta")
            val bytes = body.toByteArray()
            ex.sendResponseHeaders(status, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        s.start()
        server = s
        return URI.create("http://127.0.0.1:${s.address.port}/api/oauth/usage")
    }

    @Test
    fun `a subscription login reads windows with the token and beta header`(@TempDir dir: File) {
        val seen = mutableListOf<Pair<String?, String?>>()
        val source = OAuthClaudeUsageSource(mapper).apply {
            credentialsFile = credentials(dir, "tok-123")
            endpoint = serve(200, """{"five_hour":{"utilization":10,"resets_at":null}}""", seen)
        }

        val reading = source.read()

        assertTrue(reading is UsageReading.Windows)
        assertEquals(10.0, (reading as UsageReading.Windows).windows.single().utilization)
        assertEquals("Bearer tok-123" to "oauth-2025-04-20", seen.single())
    }

    @Test
    fun `a missing file, a file without a login, and a non-200 are all unavailable`(@TempDir dir: File) {
        val source = OAuthClaudeUsageSource(mapper)

        source.credentialsFile = File(dir, "missing.json")
        assertTrue(source.read() is UsageReading.Unavailable)

        source.credentialsFile = credentials(dir, null)
        assertTrue(source.read() is UsageReading.Unavailable)

        source.credentialsFile = credentials(dir, "tok")
        source.endpoint = serve(401, "{}", mutableListOf())
        val reading = source.read() as UsageReading.Unavailable
        assertTrue(reading.reason.contains("401"))
        assertTrue(!reading.reason.contains("tok"))
    }

    @Test
    fun `the credentials path follows the CLI's own config dir`() {
        assertEquals(File("/x/creds.json"), OAuthClaudeUsageSource.credentialsFile(mapOf("CLAUDE_CREDENTIALS_PATH" to "/x/creds.json")))
        assertEquals(File("/cfg/.credentials.json"), OAuthClaudeUsageSource.credentialsFile(mapOf("CLAUDE_CONFIG_DIR" to "/cfg")))
        assertEquals(
            File(System.getProperty("user.home"), ".claude/.credentials.json"),
            OAuthClaudeUsageSource.credentialsFile(emptyMap()),
        )
    }
}
