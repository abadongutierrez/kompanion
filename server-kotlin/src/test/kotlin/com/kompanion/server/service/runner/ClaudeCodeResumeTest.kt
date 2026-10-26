package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.entity.Agent
import com.kompanion.server.service.ClaudeHarnessService
import com.kompanion.server.service.WorkspaceEnforcementService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import tools.jackson.databind.json.JsonMapper
import java.io.File
import java.math.BigDecimal
import java.util.UUID

// Resuming a Claude Code session: the command line, where the session id comes
// from, how a resumed run's cost is read, and the missing-session check. The
// event and result shapes are from a real `claude -p --resume` run.
class ClaudeCodeResumeTest {

    private val enforcement = WorkspaceEnforcementService(JsonMapper.builder().build(), ClaudeHarnessService())
    private val runner = ClaudeCodeRunner(enforcement)

    private fun ctx(tmp: File, prompt: String, resume: ResumeContext?) = RunContext(
        agent = Agent(id = UUID.randomUUID(), title = "Eng", slug = "eng", harnessPath = "h", runtime = AgentRuntime.claude_code),
        prompt = prompt,
        harnessDir = tmp,
        instanceDir = tmp,
        cwdDir = tmp,
        taskWorkspaceDir = tmp,
        taskId = UUID.randomUUID(),
        remainingBudgetUsd = null,
        resume = resume,
    )

    private fun result(totalCost: Double, subtype: String = "success", text: String? = "pelican") = mapOf(
        "type" to "result",
        "subtype" to subtype,
        "result" to text,
        "session_id" to "47fecd54-bd54-4e92-86c9-b63067e95022",
        "total_cost_usd" to totalCost,
    )

    @Test
    fun `a resumed run passes --resume with the session id and the follow-up as the prompt`(@TempDir tmp: File) {
        val args = runner.buildCommand(ctx(tmp, "What was my secret word?", ResumeContext("sess-1", null)))

        assertEquals("What was my secret word?", args[args.indexOf("-p") + 1])
        assertEquals("sess-1", args[args.indexOf("--resume") + 1])
        // The rest of the command line is unchanged by a resume.
        assertTrue(args.containsAll(listOf("--output-format", "stream-json", "--verbose")))
    }

    @Test
    fun `a fresh run has no --resume`(@TempDir tmp: File) {
        val args = runner.buildCommand(ctx(tmp, "do it", null))
        assertFalse("--resume" in args)
        assertEquals("do it", args[args.indexOf("-p") + 1])
    }

    @Test
    fun `the session id is read from system init and nothing else`() {
        val init = mapOf("type" to "system", "subtype" to "init", "session_id" to "abc")
        assertEquals("abc", runner.sessionIdFrom(init))
        assertNull(runner.sessionIdFrom(mapOf("type" to "result", "session_id" to "abc")))
        assertNull(runner.sessionIdFrom(mapOf("type" to "system", "subtype" to "compact_boundary", "session_id" to "abc")))
    }

    @Test
    fun `claude code can resume, pi and opencode cannot`() {
        assertTrue(runner.supportsResume)
        assertFalse(PiRunner(enforcement).supportsResume)
        assertFalse(OpencodeRunner().supportsResume)
    }

    // On --resume, total_cost_usd is the session's running total. Measured:
    // a first run reported 0.00203532, its resume 0.00348919.
    @Test
    fun `a resumed run's cost is what it added to the session, so the budget counts it once`(@TempDir tmp: File) {
        val previous = result(0.00203532)
        val interpreted = runner.interpret(
            ctx(tmp, "follow-up", ResumeContext("s", previous)),
            listOf(result(0.00348919)), 0, "",
        )
        assertEquals(0, BigDecimal("0.00145387").compareTo(interpreted.costUsd))
    }

    @Test
    fun `a fresh run's cost is taken as reported`(@TempDir tmp: File) {
        val interpreted = runner.interpret(ctx(tmp, "p", null), listOf(result(0.5)), 0, "")
        assertEquals(0, BigDecimal("0.5").compareTo(interpreted.costUsd))
    }

    @Test
    fun `a total below the previous one is taken as this run's own`(@TempDir tmp: File) {
        val interpreted = runner.interpret(
            ctx(tmp, "p", ResumeContext("s", result(0.9))),
            listOf(result(0.2)), 0, "",
        )
        assertEquals(0, BigDecimal("0.2").compareTo(interpreted.costUsd))
    }

    @Test
    fun `an error result is summarised from its errors`() {
        val errored = result(0.0, subtype = "error_during_execution", text = null) +
            ("errors" to listOf("No conversation found with session ID: 0000"))
        val interpreted = runner.interpret(listOf(errored), 1, "")
        assertFalse(interpreted.ok)
        assertEquals("No conversation found with session ID: 0000", interpreted.summary)
    }

    @Test
    fun `a session file anywhere under projects is found, a missing one is reported`(@TempDir tmp: File) {
        File(tmp, "projects/-some-escaped-cwd").mkdirs()
        File(tmp, "projects/-some-escaped-cwd/sess-1.jsonl").writeText("{}\n")

        assertNull(runner.resumeProblem("sess-1", tmp.path))
        val problem = runner.resumeProblem("sess-2", tmp.path)!!
        assertTrue(problem.contains("sess-2") && problem.contains("not found"), problem)
        // No projects folder at all is the same answer, not a crash.
        assertTrue(runner.resumeProblem("sess-1", File(tmp, "nowhere").path)!!.contains("not found"))
    }
}
