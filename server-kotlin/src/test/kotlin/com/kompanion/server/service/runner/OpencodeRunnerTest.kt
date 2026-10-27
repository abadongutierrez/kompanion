package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.entity.Agent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.util.UUID

// QA regression for opencode v1: adding opencode2 moved the workspace and
// harness code into OpencodeWorkspace. v1's command line and harness check
// must stay exactly as they were (verified on 1.18.23).
class OpencodeRunnerTest {

    private val runner = OpencodeRunner()

    private fun ctx(tmp: File, model: String?) = RunContext(
        agent = Agent(
            id = UUID.randomUUID(), title = "Eng", slug = "eng", harnessPath = "h",
            runtime = AgentRuntime.opencode, model = model,
        ),
        prompt = "do it",
        harnessDir = tmp,
        instanceDir = tmp,
        cwdDir = File(tmp, "cwd"),
        taskWorkspaceDir = tmp,
        taskId = UUID.randomUUID(),
        remainingBudgetUsd = null,
    )

    @Test
    fun `v1 still passes --dir and --model, and never --standalone`(@TempDir tmp: File) {
        val c = ctx(tmp, "ollama/qwen2.5-coder:7b")
        val args = runner.buildCommand(c)

        assertEquals(System.getenv("OPENCODE_BIN") ?: "opencode", args[0])
        assertEquals(
            listOf(
                "run", "--format", "json", "--dir", c.cwdDir.path, "--agent", "kompanion", "--auto",
                "--model", "ollama/qwen2.5-coder:7b", "do it",
            ),
            args.drop(1),
        )
        assertFalse("--standalone" in args)
    }

    @Test
    fun `v1 and v2 refuse the same harnesses`(@TempDir tmp: File) {
        // The agent file itself is covered by RunnerInstanceTest.
        val v2 = Opencode2Runner()
        File(tmp, "CLAUDE.md").writeText("claude only")
        assertNotNull(runner.validateHarness(tmp))
        assertEquals(runner.validateHarness(tmp), v2.validateHarness(tmp))

        File(tmp, "AGENTS.md").writeText("# Be an engineer")
        assertNull(runner.validateHarness(tmp))
        assertNull(v2.validateHarness(tmp))
    }
}
