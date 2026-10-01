package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.entity.Agent
import com.kompanion.server.service.ClaudeHarnessService
import com.kompanion.server.service.ManifestRepoEntry
import com.kompanion.server.service.WorkspaceEnforcementService
import com.kompanion.server.service.WorkspaceManifest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import tools.jackson.databind.ObjectMapper
import java.io.File
import java.util.UUID

// What each runner builds its working directory from. The runners read the
// stored agent instance, not the harness, so a skill that was built into the
// instance has to arrive in the run, and the system prompt has to come from
// the instance too. The harness folder holds different text on purpose: if a
// runner reads the wrong folder, these fail.
class RunnerInstanceTest {

    private class Setup(tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        val harness = File(tmp, "harness").apply { mkdirs() }
        val instance = File(tmp, "instance").apply { mkdirs() }
        val cwd = File(tmp, "cwd")
        val taskWorkspace = File(tmp, "task")
        val enforcement: WorkspaceEnforcementService

        init {
            // What enforcement installs from: the three hook scripts and the
            // pi extension. Their content does not matter here.
            for (name in listOf("enforce-workspace.py", "exec_in_folder.py", "_workspace_common.py")) {
                File(library, "hooks/$name").apply { parentFile.mkdirs() }.writeText("# $name")
            }
            File(library, "pi/enforce-workspace.ts").apply { parentFile.mkdirs() }.writeText("// ext")
            enforcement = WorkspaceEnforcementService(
                ObjectMapper(),
                ClaudeHarnessService(library, File(tmp, "ws")),
            )
        }

        fun write(root: File, path: String, text: String = "x") {
            File(root, path).apply { parentFile.mkdirs() }.writeText(text)
        }

        fun ctx(runtime: AgentRuntime) = RunContext(
            agent = Agent(id = UUID.randomUUID(), title = "Eng", slug = "eng", harnessPath = "h", runtime = runtime),
            prompt = "do it",
            harnessDir = harness,
            instanceDir = instance,
            cwdDir = cwd,
            taskWorkspaceDir = taskWorkspace,
            taskId = UUID.randomUUID(),
            remainingBudgetUsd = null,
        )

        val manifest = WorkspaceManifest(
            taskWorkspace = File(tmp, "task").path,
            branchName = null,
            primary = ManifestRepoEntry(null, null, "unused"),
            otherRepos = emptyList(),
        )
    }

    // -- Claude Code ----------------------------------------------------

    @Test
    fun `claude code builds dot-claude from the instance, skills included, and wipes what was there`(@TempDir tmp: File) {
        val s = Setup(tmp)
        s.write(s.instance, ".claude/settings.json", "{}")
        s.write(s.instance, ".claude/skills/handoff/SKILL.md", "from the instance")
        s.write(s.harness, ".claude/skills/stale/SKILL.md", "harness only")
        s.write(s.cwd, ".claude/skills/previous-agent/SKILL.md", "left by the last agent")

        ClaudeCodeRunner(s.enforcement).prepareWorkspace(s.ctx(AgentRuntime.claude_code), s.manifest)

        assertEquals("from the instance", File(s.cwd, ".claude/skills/handoff/SKILL.md").readText())
        assertFalse(File(s.cwd, ".claude/skills/stale").exists())
        assertFalse(File(s.cwd, ".claude/skills/previous-agent").exists())
        // Enforcement is installed on top, as before.
        assertTrue(File(s.cwd, ".claude/hooks/enforce-workspace.py").exists())
        assertTrue(File(s.cwd, ".claude/settings.json").readText().contains("PreToolUse"))
    }

    @Test
    fun `claude code takes its system prompt from the instance`(@TempDir tmp: File) {
        val s = Setup(tmp)
        s.write(s.instance, "CLAUDE.md", "prompt from the instance")
        s.write(s.harness, "CLAUDE.md", "prompt from the harness")

        val args = ClaudeCodeRunner(s.enforcement).buildCommand(s.ctx(AgentRuntime.claude_code))

        assertEquals("prompt from the instance", args[args.indexOf("--append-system-prompt") + 1])
    }

    @Test
    fun `claude code with an instance that has no dot-claude still prepares, and still installs enforcement`(@TempDir tmp: File) {
        val s = Setup(tmp)

        ClaudeCodeRunner(s.enforcement).prepareWorkspace(s.ctx(AgentRuntime.claude_code), s.manifest)

        assertTrue(File(s.cwd, ".claude/hooks/exec_in_folder.py").exists())
    }

    // -- opencode -------------------------------------------------------

    @Test
    fun `opencode builds dot-opencode from the instance, skills included, and writes the agent from its prompt`(@TempDir tmp: File) {
        val s = Setup(tmp)
        s.write(s.instance, ".opencode/skills/handoff/SKILL.md", "from the instance")
        s.write(s.instance, "AGENTS.md", "opencode prompt from the instance")
        s.write(s.harness, "AGENTS.md", "opencode prompt from the harness")
        s.write(s.cwd, ".opencode/skills/previous-agent/SKILL.md", "left by the last agent")

        OpencodeRunner().prepareWorkspace(s.ctx(AgentRuntime.opencode), s.manifest)

        assertEquals("from the instance", File(s.cwd, ".opencode/skills/handoff/SKILL.md").readText())
        assertFalse(File(s.cwd, ".opencode/skills/previous-agent").exists())
        val agent = File(s.cwd, ".opencode/agents/kompanion.md").readText()
        assertTrue(agent.contains("opencode prompt from the instance"))
        assertFalse(agent.contains("from the harness"))
    }

    @Test
    fun `opencode falls back to CLAUDE md in the instance when there is no AGENTS md`(@TempDir tmp: File) {
        val s = Setup(tmp)
        s.write(s.instance, "CLAUDE.md", "claude text in the instance")

        OpencodeRunner().prepareWorkspace(s.ctx(AgentRuntime.opencode), s.manifest)

        assertTrue(File(s.cwd, ".opencode/agents/kompanion.md").readText().contains("claude text in the instance"))
    }

    // -- pi -------------------------------------------------------------

    @Test
    fun `pi copies pi-agent from the instance and brings its runtime files from the harness`(@TempDir tmp: File) {
        val s = Setup(tmp)
        s.write(s.instance, "pi-agent/models.json", "from the instance")
        // pi's own state is not in the stored instance, only in the harness.
        s.write(s.harness, "pi-agent/models.json", "from the harness")
        s.write(s.harness, "pi-agent/auth.json", """{"key":"abc"}""")
        s.write(s.harness, "pi-agent/models-store.json", "{}")

        PiRunner(s.enforcement).prepareWorkspace(s.ctx(AgentRuntime.pi), s.manifest)

        val config = File(s.taskWorkspace, "pi-agent")
        assertEquals("from the instance", File(config, "models.json").readText())
        assertEquals("""{"key":"abc"}""", File(config, "auth.json").readText())
        assertTrue(File(config, "models-store.json").exists())
        assertTrue(File(config, "extensions/enforce-workspace.ts").exists())
        // Nothing lands in the working directory.
        assertFalse(s.cwd.exists() && s.cwd.listFiles()!!.isNotEmpty())
    }

    @Test
    fun `pi passes the instance's skill folders and its system prompt`(@TempDir tmp: File) {
        val s = Setup(tmp)
        s.write(s.instance, "AGENTS.md", "pi prompt from the instance")
        s.write(s.harness, "AGENTS.md", "pi prompt from the harness")
        s.write(s.instance, ".pi/skills/handoff/SKILL.md")
        s.write(s.instance, ".claude/skills/own/SKILL.md")
        // Skills that exist only in the harness are not passed.
        s.write(s.harness, ".pi/skills/stale/SKILL.md")

        val args = PiRunner(s.enforcement).buildCommand(s.ctx(AgentRuntime.pi))

        assertEquals("pi prompt from the instance", args[args.indexOf("--append-system-prompt") + 1])
        val skillFlags = args.indices.filter { args[it] == "--skill" }.map { args[it + 1] }
        assertEquals(
            listOf(File(s.instance, ".pi/skills").path, File(s.instance, ".claude/skills").path),
            skillFlags,
        )
    }

    @Test
    fun `pi with an instance that has no skill folders passes no skill flag`(@TempDir tmp: File) {
        val s = Setup(tmp)
        s.write(s.instance, "AGENTS.md", "x")

        val args = PiRunner(s.enforcement).buildCommand(s.ctx(AgentRuntime.pi))

        assertFalse("--skill" in args)
    }
}
