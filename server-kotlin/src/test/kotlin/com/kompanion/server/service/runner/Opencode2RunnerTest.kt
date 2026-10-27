package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import com.kompanion.server.entity.Agent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import java.io.File
import java.math.BigDecimal
import java.util.UUID

// The fixtures under resources/opencode2/ are recorded from real
// `opencode run --standalone --format json` runs against opencode 2.0.26,
// not written from documentation.
class Opencode2RunnerTest {

    private val runner = Opencode2Runner()
    private val mapper = ObjectMapper()

    private fun fixture(name: String): String =
        javaClass.getResource("/opencode2/$name")!!.readText()

    private fun events(name: String): List<Map<String, Any?>> =
        fixture(name).lines().filter { it.isNotBlank() }.map { mapper.readValue(it) }

    private fun ctx(tmp: File, model: String?, runtime: Runtime? = null) = RunContext(
        agent = Agent(
            id = UUID.randomUUID(), title = "Eng", slug = "eng", harnessPath = "h",
            runtime = AgentRuntime.opencode2, model = model,
        ),
        prompt = "do it",
        harnessDir = tmp,
        instanceDir = tmp,
        cwdDir = File(tmp, "cwd"),
        taskWorkspaceDir = tmp,
        taskId = UUID.randomUUID(),
        remainingBudgetUsd = null,
        runtime = runtime,
    )

    @Test
    fun `the runtime chosen in settings supplies the binary`(@TempDir tmp: File) {
        val runtime = Runtime(name = "opencode2", kind = AgentRuntime.opencode2, binaryPath = "/opt/oc2/bin/opencode2")

        assertEquals("/opt/oc2/bin/opencode2", runner.buildCommand(ctx(tmp, null, runtime))[0])
    }

    @Test
    fun `runs standalone with json, auto and the kompanion agent, and no --dir`(@TempDir tmp: File) {
        val args = runner.buildCommand(ctx(tmp, "opencode-go/deepseek-v4.1-flash"))

        assertEquals(System.getenv("OPENCODE2_BIN") ?: "opencode2", args[0])
        assertEquals(
            listOf(
                "run", "--standalone", "--format", "json", "--auto", "--agent", "kompanion",
                "-m", "opencode-go/deepseek-v4.1-flash", "do it",
            ),
            args.drop(1),
        )
        assertFalse("--dir" in args)
    }

    @Test
    fun `leaves the model out when the Agent has none`(@TempDir tmp: File) {
        val args = runner.buildCommand(ctx(tmp, null))
        assertFalse("-m" in args)
        assertEquals("do it", args.last())
    }

    @Test
    fun `refuses a harness without dot-opencode or AGENTS md, like opencode`(@TempDir tmp: File) {
        assertNotNull(runner.validateHarness(tmp))
        File(tmp, "AGENTS.md").writeText("x")
        assertNull(runner.validateHarness(tmp))
    }

    @Test
    fun `a successful run takes cost and tokens from the session summary`() {
        val summary = runner.sessionSummary(
            "ses_e85a03aa5ffeyR8Tk4c5aOBbB4",
            fixture("success-with-tool.export.json"),
        )!!
        // Round-tripped through JSON, the way it is stored and replayed.
        val stored: Map<String, Any?> = mapper.readValue(mapper.writeValueAsString(summary))

        val result = runner.interpret(events("success-with-tool.jsonl") + stored, exitCode = 0, stderr = "")

        assertTrue(result.ok)
        assertEquals("PONG", result.summary)
        // The stream's only step_finish says 0.000992424; the session total
        // includes the last step the stream leaves out.
        assertEquals(0, result.costUsd!!.compareTo(BigDecimal("0.001100564")))
        assertEquals(7053L, result.tokens.input)
        assertEquals(57L, result.tokens.output)
        assertEquals(9088L, result.tokens.cacheRead)
        assertEquals(0L, result.tokens.cacheWrite)
    }

    @Test
    fun `without a session summary the step_finish events are the fallback`() {
        val result = runner.interpret(events("success-with-tool.jsonl"), exitCode = 0, stderr = "")

        assertTrue(result.ok)
        assertEquals(0, result.costUsd!!.compareTo(BigDecimal("0.000992424")))
        assertEquals(6360L, result.tokens.input)
    }

    @Test
    fun `zero is a real cost`() {
        val events = events("success-with-tool.jsonl") + mapOf(
            "type" to "session_summary", "cost" to 0, "tokens" to mapOf("input" to 10, "output" to 2),
        )
        val result = runner.interpret(events, exitCode = 0, stderr = "")
        assertEquals(0, result.costUsd!!.compareTo(BigDecimal.ZERO))
    }

    @Test
    fun `a no-route error fails the run with its message`() {
        val result = runner.interpret(events("error-no-route.jsonl"), exitCode = 1, stderr = "")

        assertFalse(result.ok)
        assertEquals("Model unavailable: opencode-go/deepseek-v4-flash", result.summary)
    }

    @Test
    fun `an auth error fails the run with its message`() {
        val result = runner.interpret(events("error-auth.jsonl"), exitCode = 1, stderr = "")

        assertFalse(result.ok)
        assertTrue(result.summary!!.startsWith("Incorrect API key provided"))
    }

    @Test
    fun `no output at all is a failure, not an empty success`() {
        val result = runner.interpret(emptyList(), exitCode = 0, stderr = "")
        assertFalse(result.ok)
    }

    @Test
    fun `an export that hangs with stdout held open gives up instead of blocking`(@TempDir tmp: File) {
        // A child keeps stdout open past the CLI, the way a standalone
        // server that never shuts down would.
        val bin = File(tmp, "opencode2").apply {
            writeText("#!/bin/sh\necho partial\nsleep 30 &\nsleep 30\n")
            setExecutable(true)
        }
        val hanging = Opencode2Runner().apply { exportTimeoutSeconds = 1 }

        val started = System.nanoTime()
        assertNull(hanging.exportSession(bin.absolutePath, tmp, "ses_x"))
        assertTrue(System.nanoTime() - started < 15_000_000_000L, "export should give up near its timeout")
    }

    @Test
    fun `a quick export returns its output`(@TempDir tmp: File) {
        val bin = File(tmp, "opencode2").apply {
            writeText("#!/bin/sh\necho '{\"info\":{}}'\n")
            setExecutable(true)
        }

        assertEquals("{\"info\":{}}", runner.exportSession(bin.absolutePath, tmp, "ses_x")?.trim())
    }

    @Test
    fun `an export that is not JSON gives no summary`() {
        assertNull(runner.sessionSummary("ses_x", "not json"))
    }
}
