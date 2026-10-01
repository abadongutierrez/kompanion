package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.BuildInstanceRequest
import com.kompanion.server.application.port.outbound.GitState
import com.kompanion.server.application.port.outbound.LibraryVersion
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Skill
import com.kompanion.server.domain.model.SkillOutcome
import com.kompanion.server.service.ClaudeHarnessService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.util.UUID

private class FakeLibraryVersion(var state: GitState? = null) : LibraryVersion {
    var asked: List<String> = emptyList()

    override fun of(paths: List<String>): GitState? {
        asked = paths
        return state
    }
}

class AgentInstancesTest {

    private class Setup(tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        val workspace = File(tmp, "ws").apply { mkdirs() }
        val git = FakeLibraryVersion()
        val instances = FileAgentInstances(ClaudeHarnessService(library, workspace), git)
        val store = File(workspace, "agent-instances")

        fun write(path: String, text: String = "x") {
            File(library, path).apply { parentFile.mkdirs() }.writeText(text)
        }

        // A harness that carries every runtime's layout, like engineer/ does,
        // plus pi's runtime files and a file no runtime reads.
        fun harness() {
            write("harnesses/h/CLAUDE.md", "claude prompt")
            write("harnesses/h/AGENTS.md", "agents prompt")
            write("harnesses/h/other.txt", "no runtime reads this")
            write("harnesses/h/.claude/settings.json", "{}")
            write("harnesses/h/.claude/skills/own/SKILL.md", "harness-owned")
            write("harnesses/h/.opencode/agents/a.md", "oc agent")
            write("harnesses/h/pi-agent/models.json", "{}")
            write("harnesses/h/pi-agent/auth.json", """{"secret":"token"}""")
            write("harnesses/h/pi-agent/models-store.json", "{}")
            write("harnesses/h/pi-agent/trust.json", "{}")
            write("harnesses/h/pi-agent/sessions/s.jsonl", "log")
            write("harnesses/h/pi-agent/npm/pkg/index.js", "js")
            write("harnesses/h/.pi/skills/pi-own/SKILL.md", "pi-owned")
        }

        fun skill(slug: String, body: String = "---\nname: $slug\ndescription: d\n---\n"): Skill {
            write("skills/$slug/SKILL.md", body)
            return Skill(id = UUID.randomUUID(), slug = slug, name = slug, description = "d", skillPath = "skills/$slug")
        }

        fun build(runtime: AgentRuntime, vararg skills: Skill) =
            instances.build(BuildInstanceRequest(runtime, "harnesses/h", skills.toList()))

        fun files(dir: String): Set<String> =
            FolderHash.files(File(dir)).map { it.first }.toSet()
    }

    // -- layouts --------------------------------------------------------

    @Test
    fun `a claude_code instance holds CLAUDE md and dot-claude, with library skills in dot-claude skills`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val built = s.build(AgentRuntime.claude_code, s.skill("handoff"))

        val files = s.files(built.path)
        assertTrue("CLAUDE.md" in files)
        assertTrue(".claude/settings.json" in files)
        assertTrue(".claude/skills/own/SKILL.md" in files)
        assertTrue(".claude/skills/handoff/SKILL.md" in files)
        // Nothing another runtime reads.
        assertFalse(files.any { it.startsWith(".opencode") || it.startsWith("pi-agent") || it == "AGENTS.md" || it == "other.txt" })
    }

    @Test
    fun `a pi instance holds the prompts, pi-agent without its runtime files, and library skills in dot-pi skills`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val built = s.build(AgentRuntime.pi, s.skill("handoff"))

        val files = s.files(built.path)
        assertTrue("AGENTS.md" in files && "CLAUDE.md" in files)
        assertTrue("pi-agent/models.json" in files)
        assertTrue(".pi/skills/pi-own/SKILL.md" in files)
        assertTrue(".claude/skills/own/SKILL.md" in files)
        assertTrue(".pi/skills/handoff/SKILL.md" in files)
        // Credentials and pi's own state never go into the store.
        assertFalse("pi-agent/auth.json" in files)
        assertFalse("pi-agent/models-store.json" in files)
        assertFalse("pi-agent/trust.json" in files)
        assertFalse(files.any { it.startsWith("pi-agent/sessions") || it.startsWith("pi-agent/npm") })
        assertFalse(files.any { it.startsWith(".opencode") })
        // And so the secret is nowhere in the stored folder.
        assertFalse(FolderHash.files(File(built.path)).any { it.second.readText().contains("token") })
    }

    @Test
    fun `an opencode instance holds the prompts and dot-opencode, with library skills in dot-opencode skills`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val built = s.build(AgentRuntime.opencode, s.skill("handoff"))

        val files = s.files(built.path)
        assertTrue("AGENTS.md" in files)
        assertTrue(".opencode/agents/a.md" in files)
        assertTrue(".opencode/skills/handoff/SKILL.md" in files)
        assertFalse(files.any { it.startsWith(".claude") || it.startsWith("pi-agent") })
    }

    @Test
    fun `a skill's script keeps its executable bit`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val skill = s.skill("handoff")
        File(s.library, "skills/handoff/scripts").mkdirs()
        File(s.library, "skills/handoff/scripts/run.sh").apply { writeText("#!/bin/sh\n"); setExecutable(true) }

        val built = s.build(AgentRuntime.claude_code, skill)

        assertTrue(File(built.path, ".claude/skills/handoff/scripts/run.sh").canExecute())
    }

    // -- hashing and the store -----------------------------------------

    @Test
    fun `the same inputs give the same hash and one stored folder`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val skill = s.skill("handoff")

        val first = s.build(AgentRuntime.claude_code, skill)
        val second = s.build(AgentRuntime.claude_code, skill)

        assertEquals(first.instance.hash, second.instance.hash)
        assertEquals(first.path, second.path)
        assertEquals(listOf(first.instance.hash), s.store.list()!!.toList())
    }

    @Test
    fun `the hash is of the content, and instance json is not part of it`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val built = s.build(AgentRuntime.claude_code, s.skill("handoff"))

        assertTrue(File(built.path, "instance.json").readText().contains("claude_code"))
        assertEquals(built.instance.hash, FolderHash.of(File(built.path)) { it == "instance.json" })
    }

    @Test
    fun `a changed skill gives a different instance`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val skill = s.skill("handoff")
        val before = s.build(AgentRuntime.claude_code, skill)

        s.write("skills/handoff/SKILL.md", "---\nname: handoff\ndescription: changed\n---\n")
        val after = s.build(AgentRuntime.claude_code, skill)

        assertNotEquals(before.instance.hash, after.instance.hash)
        assertEquals(2, s.store.list()!!.size)
    }

    @Test
    fun `another runtime's files do not change this runtime's hash`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val before = s.build(AgentRuntime.claude_code)

        s.write("harnesses/h/.opencode/agents/a.md", "changed")
        s.write("harnesses/h/pi-agent/models.json", """{"changed":true}""")
        s.write("harnesses/h/other.txt", "changed")
        val after = s.build(AgentRuntime.claude_code)

        assertEquals(before.instance.hash, after.instance.hash)
    }

    @Test
    fun `the same harness gives different instances for different runtimes`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        assertNotEquals(
            s.build(AgentRuntime.claude_code).instance.hash,
            s.build(AgentRuntime.pi).instance.hash,
        )
    }

    @Test
    fun `no staging folder is left behind`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        s.build(AgentRuntime.claude_code, s.skill("handoff"))

        assertTrue(s.store.list()!!.none { it.startsWith(".staging") })
    }

    // -- outcomes -------------------------------------------------------

    @Test
    fun `a loaded skill records its hash, which is the hash of its folder`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val skill = s.skill("handoff")

        val loaded = s.build(AgentRuntime.claude_code, skill).instance.skills.single()

        assertEquals("handoff", loaded.slug)
        assertEquals(SkillOutcome.loaded, loaded.outcome)
        assertEquals(FolderHash.of(File(s.library, "skills/handoff")), loaded.hash)
    }

    @Test
    fun `the harness wins a name clash, and the skill is recorded as skipped`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        // The harness already has .claude/skills/own.
        val clash = s.skill("own", "---\nname: own\ndescription: library version\n---\n")

        val built = s.build(AgentRuntime.claude_code, clash)

        assertEquals(SkillOutcome.skipped_harness_has_it, built.instance.skills.single().outcome)
        assertEquals("harness-owned", File(built.path, ".claude/skills/own/SKILL.md").readText())
    }

    @Test
    fun `a clash is judged against the folders that runtime reads`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val own = s.skill("own")

        // pi reads .claude/skills too, so "own" clashes there; opencode does
        // not read .claude/, so the same skill loads.
        assertEquals(SkillOutcome.skipped_harness_has_it, s.build(AgentRuntime.pi, own).instance.skills.single().outcome)
        assertEquals(SkillOutcome.loaded, s.build(AgentRuntime.opencode, own).instance.skills.single().outcome)
    }

    @Test
    fun `a skill whose folder is gone is recorded as missing and the build still succeeds`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val gone = Skill(id = UUID.randomUUID(), slug = "gone", name = "gone", description = "d", skillPath = "skills/gone")

        val built = s.build(AgentRuntime.claude_code, gone)

        val skill = built.instance.skills.single()
        assertEquals(SkillOutcome.missing, skill.outcome)
        assertNull(skill.hash)
        assertFalse(File(built.path, ".claude/skills/gone").exists())
    }

    @Test
    fun `skills are recorded in slug order whatever order they were given`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val z = s.skill("z")
        val a = s.skill("a")

        assertEquals(listOf("a", "z"), s.build(AgentRuntime.claude_code, z, a).instance.skills.map { it.slug })
        // And the order does not change the hash.
        assertEquals(
            s.build(AgentRuntime.claude_code, z, a).instance.hash,
            s.build(AgentRuntime.claude_code, a, z).instance.hash,
        )
    }

    // -- git facts ------------------------------------------------------

    @Test
    fun `git facts are passed through, asked about the harness and the skills it used`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        s.git.state = GitState("abc123", dirty = true)
        val skill = s.skill("handoff")
        val gone = Skill(id = UUID.randomUUID(), slug = "gone", name = "gone", description = "d", skillPath = "skills/gone")

        val built = s.build(AgentRuntime.claude_code, skill, gone)

        assertEquals("abc123", built.instance.gitSha)
        assertEquals(true, built.instance.gitDirty)
        assertEquals(
            listOf(File(s.library, "harnesses/h").path, File(s.library, "skills/handoff").path),
            s.git.asked,
        )
    }

    @Test
    fun `no git facts means null, not an error`(@TempDir tmp: File) {
        val s = Setup(tmp).apply { harness() }
        val built = s.build(AgentRuntime.claude_code)

        assertNull(built.instance.gitSha)
        assertNull(built.instance.gitDirty)
    }
}

class GitLibraryVersionTest {

    private fun git(dir: File, vararg args: String) {
        val process = ProcessBuilder(listOf("git", "-C", dir.path) + args)
            .redirectErrorStream(true)
            .start()
        process.inputStream.readBytes()
        check(process.waitFor() == 0) { "git ${args.joinToString(" ")} failed" }
    }

    private fun commitAll(dir: File) {
        git(dir, "add", "-A")
        git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x")
    }

    private fun version(library: File, workspace: File) =
        GitLibraryVersion(ClaudeHarnessService(library, workspace))

    @Test
    fun `a library outside any git repo has no facts`(@TempDir tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        assertNull(version(library, File(tmp, "ws")).of(listOf(library.path)))
    }

    @Test
    fun `a repo with no commits has no facts`(@TempDir tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        git(library, "init", "-q")
        assertNull(version(library, File(tmp, "ws")).of(listOf(library.path)))
    }

    @Test
    fun `a clean repo gives the commit and not dirty`(@TempDir tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        File(library, "f.txt").writeText("1")
        git(library, "init", "-q")
        commitAll(library)

        val state = version(library, File(tmp, "ws")).of(listOf(library.path))!!

        assertEquals(40, state.sha.length)
        assertFalse(state.dirty)
    }

    @Test
    fun `a changed or an untracked file in a used folder makes it dirty`(@TempDir tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        File(library, "skills/a").mkdirs()
        File(library, "skills/a/SKILL.md").writeText("1")
        git(library, "init", "-q")
        commitAll(library)
        val version = version(library, File(tmp, "ws"))
        val skill = File(library, "skills/a").path

        File(library, "skills/a/SKILL.md").writeText("2")
        assertTrue(version.of(listOf(skill))!!.dirty)

        commitAll(library)
        assertFalse(version.of(listOf(skill))!!.dirty)

        File(library, "skills/a/new.txt").writeText("untracked")
        assertTrue(version.of(listOf(skill))!!.dirty)
    }

    @Test
    fun `changes outside the folders that were used do not count`(@TempDir tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        File(library, "skills/a").mkdirs()
        File(library, "skills/a/SKILL.md").writeText("1")
        File(library, "skills/b").mkdirs()
        File(library, "skills/b/SKILL.md").writeText("1")
        git(library, "init", "-q")
        commitAll(library)

        File(library, "skills/b/SKILL.md").writeText("changed")

        assertFalse(version(library, File(tmp, "ws")).of(listOf(File(library, "skills/a").path))!!.dirty)
    }

    @Test
    fun `a used folder outside the repo is left to its own hash`(@TempDir tmp: File) {
        val library = File(tmp, "library").apply { mkdirs() }
        File(library, "f.txt").writeText("1")
        git(library, "init", "-q")
        commitAll(library)
        val elsewhere = File(tmp, "elsewhere").apply { mkdirs() }
        File(elsewhere, "SKILL.md").writeText("uncommitted, but not in this repo")

        assertFalse(version(library, File(tmp, "ws")).of(listOf(elsewhere.path))!!.dirty)
    }
}
