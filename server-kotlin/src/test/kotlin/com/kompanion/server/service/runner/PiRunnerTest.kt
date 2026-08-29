package com.kompanion.server.service.runner

import com.kompanion.server.service.ClaudeHarnessService
import com.kompanion.server.service.WorkspaceEnforcementService
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import tools.jackson.databind.json.JsonMapper

// interpret() only — the shapes are taken from a real `pi -p --mode json`
// run against an LM Studio model, which is the part of this runner most
// likely to drift when pi changes.
class PiRunnerTest {

    private val runner = PiRunner(
        WorkspaceEnforcementService(JsonMapper.builder().build(), ClaudeHarnessService()),
    )

    private fun assistantEnd(
        stopReason: String,
        content: List<Map<String, Any?>>,
        usage: Map<String, Any?>,
        errorMessage: String? = null,
    ): Map<String, Any?> = mapOf(
        "type" to "message_end",
        "message" to mapOf(
            "role" to "assistant",
            "stopReason" to stopReason,
            "content" to content,
            "usage" to usage,
            "errorMessage" to errorMessage,
        ),
    )

    private fun usage(input: Long, output: Long, cost: Double) = mapOf(
        "input" to input,
        "output" to output,
        "cacheRead" to 0,
        "cacheWrite" to 0,
        "cost" to mapOf("total" to cost),
    )

    @Test
    fun `sums usage across turns and answers with the last text`() {
        val events = listOf(
            assistantEnd("toolUse", listOf(mapOf("type" to "toolCall")), usage(1773, 180, 0.0)),
            // A tool result is also a message_end; only assistant messages count.
            mapOf("type" to "message_end", "message" to mapOf("role" to "toolResult")),
            assistantEnd(
                "stop",
                listOf(
                    mapOf("type" to "thinking", "thinking" to "ignored"),
                    mapOf("type" to "text", "text" to "hello world"),
                ),
                usage(2176, 46, 0.0),
            ),
            mapOf("type" to "agent_end", "willRetry" to false, "messages" to emptyList<Any>()),
        )

        val result = runner.interpret(events, exitCode = 0, stderr = "")

        assertTrue(result.ok)
        assertEquals("hello world", result.summary)
        assertEquals(1773L + 2176L, result.tokens.input)
        assertEquals(180L + 46L, result.tokens.output)
        // A local model really is free; that is reported, not estimated away.
        assertEquals(0, result.costUsd?.compareTo(java.math.BigDecimal.ZERO))
    }

    @Test
    fun `reports pi's own error message when the final message failed`() {
        val events = listOf(
            assistantEnd(
                "error",
                emptyList(),
                usage(0, 0, 0.0),
                errorMessage = "connect ECONNREFUSED 127.0.0.1:1234",
            ),
            mapOf("type" to "agent_end", "willRetry" to false, "messages" to emptyList<Any>()),
        )

        val result = runner.interpret(events, exitCode = 1, stderr = "")

        assertFalse(result.ok)
        assertEquals("connect ECONNREFUSED 127.0.0.1:1234", result.summary)
    }

    @Test
    fun `an empty stream is a failure, not an empty success`() {
        val result = runner.interpret(emptyList(), exitCode = 127, stderr = "pi: command not found")

        assertFalse(result.ok)
        assertEquals("pi: command not found", result.summary)
        assertEquals(null, result.costUsd)
    }

    @Test
    fun `a stream that stops before agent_end is not a success`() {
        // What a killed run looks like: the last turn completed, but the
        // agent loop never finished.
        val events = listOf(
            assistantEnd("stop", listOf(mapOf("type" to "text", "text" to "partial")), usage(10, 5, 0.0)),
        )

        val result = runner.interpret(events, exitCode = 0, stderr = "")

        assertFalse(result.ok)
    }
}
