package com.kompanion.server.domain.rule

import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class ResumeEligibilityTest {

    private val runId = UUID.randomUUID()
    private val agentId = UUID.randomUUID()

    // A run that can be resumed. Each test breaks one fact.
    private val ok = ResumeFacts(
        runId = runId,
        runStatus = "succeeded",
        runAgentId = agentId,
        runRuntime = "claude_code",
        runInstanceHash = "h1",
        runSessionId = "sess",
        runSessionStore = "/home/u/.claude",
        latestRunId = runId,
        taskRunning = false,
        taskAgentId = agentId,
        taskAgentRuntime = "claude_code",
        currentInstanceHash = "h1",
        runtimeSupportsResume = true,
        currentSessionStore = "/home/u/.claude",
    )

    private fun refused(f: ResumeFacts, vararg words: String) {
        val reason = ResumeEligibility.refusal(f)
        assertTrue(reason != null && words.all { reason.contains(it) }, "got: $reason")
    }

    @Test
    fun `the newest finished run of the same Agent and instance can be resumed`() {
        assertNull(ResumeEligibility.refusal(ok))
        assertNull(ResumeEligibility.refusal(ok.copy(runStatus = "failed")))
    }

    @Test
    fun `only the latest run`() = refused(ok.copy(latestRunId = UUID.randomUUID()), "latest")

    @Test
    fun `not while the task is running`() = refused(ok.copy(taskRunning = true), "running")

    @Test
    fun `not a run that has not finished or never ran`() {
        refused(ok.copy(runStatus = "running"), "finished")
        refused(ok.copy(runStatus = "over_budget"), "finished", "over budget")
    }

    @Test
    fun `not pi or opencode`() {
        refused(ok.copy(runRuntime = "pi", taskAgentRuntime = "pi", runtimeSupportsResume = false), "pi", "fresh run")
        refused(ok.copy(runRuntime = "opencode", taskAgentRuntime = "opencode", runtimeSupportsResume = false), "opencode")
    }

    @Test
    fun `not after a handoff to another Agent, or with none assigned`() {
        refused(ok.copy(taskAgentId = UUID.randomUUID()), "different Agent", "fresh run")
        refused(ok.copy(taskAgentId = null, taskAgentRuntime = null), "different Agent")
    }

    @Test
    fun `not after the Agent moved to another runtime`() =
        refused(ok.copy(taskAgentRuntime = "pi"), "pi")

    @Test
    fun `not after a harness or skill change`() {
        refused(ok.copy(currentInstanceHash = "h2"), "harness or skills")
        // A run from before agent instances has nothing to compare.
        refused(ok.copy(runInstanceHash = null), "harness or skills")
    }

    @Test
    fun `not without a session id`() = refused(ok.copy(runSessionId = null), "no session")

    @Test
    fun `not when the CLI keeps its sessions somewhere else now`() {
        refused(ok.copy(currentSessionStore = "/other/.claude"), "/home/u/.claude", "/other/.claude")
        // A run that recorded no store (from before it was recorded) is let through;
        // the session-file check before the CLI starts still applies.
        assertNull(ResumeEligibility.refusal(ok.copy(runSessionStore = null)))
    }
}
