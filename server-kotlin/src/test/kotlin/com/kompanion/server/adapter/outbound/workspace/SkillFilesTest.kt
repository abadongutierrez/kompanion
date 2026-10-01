package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.SkillInspection
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.service.ClaudeHarnessService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class SkillFrontmatterTest {

    @Test
    fun `reads plain, quoted and folded values`() {
        val parsed = SkillFrontmatter.parse(
            """
            ---
            name: handoff
            description: "Use when finishing a task"
            other: 'single quoted'
            long: >
              first line
              second line
            literal: |
              keep
              lines
            ---
            # Body
            """.trimIndent(),
        )!!

        assertEquals("handoff", parsed["name"])
        assertEquals("Use when finishing a task", parsed["description"])
        assertEquals("single quoted", parsed["other"])
        assertEquals("first line second line", parsed["long"])
        assertEquals("keep\nlines", parsed["literal"])
    }

    @Test
    fun `no frontmatter block gives null`() {
        assertNull(SkillFrontmatter.parse("# just a heading\n"))
        assertNull(SkillFrontmatter.parse("---\nname: never closed\n"))
    }

    @Test
    fun `a byte order mark and a colon inside a value are fine`() {
        val parsed = SkillFrontmatter.parse("﻿---\nname: a\ndescription: Use when: it matters\n---\n")!!
        assertEquals("Use when: it matters", parsed["description"])
    }
}

class FolderHashTest {

    private fun write(dir: File, path: String, text: String) {
        File(dir, path).apply { parentFile.mkdirs() }.writeText(text)
    }

    @Test
    fun `the same content gives the same hash whatever the creation order or timestamps`(@TempDir tmp: File) {
        val a = File(tmp, "a")
        val b = File(tmp, "b")
        write(a, "one.txt", "1"); write(a, "sub/two.txt", "2")
        write(b, "sub/two.txt", "2"); write(b, "one.txt", "1")
        File(b, "one.txt").setLastModified(1_000_000L)

        assertEquals(FolderHash.of(a), FolderHash.of(b))
    }

    @Test
    fun `a changed byte, a renamed file or an added file changes the hash`(@TempDir tmp: File) {
        val base = File(tmp, "base").also { write(it, "f.txt", "hello") }
        val changed = File(tmp, "changed").also { write(it, "f.txt", "hellp") }
        val renamed = File(tmp, "renamed").also { write(it, "g.txt", "hello") }
        val added = File(tmp, "added").also { write(it, "f.txt", "hello"); write(it, "x.txt", "") }

        val hash = FolderHash.of(base)
        assertNotEquals(hash, FolderHash.of(changed))
        assertNotEquals(hash, FolderHash.of(renamed))
        assertNotEquals(hash, FolderHash.of(added))
    }

    @Test
    fun `where a name ends and content begins is part of the hash`(@TempDir tmp: File) {
        val a = File(tmp, "a").also { write(it, "ab", "c") }
        val b = File(tmp, "b").also { write(it, "a", "bc") }

        assertNotEquals(FolderHash.of(a), FolderHash.of(b))
    }

    @Test
    fun `empty folders are not content`(@TempDir tmp: File) {
        val a = File(tmp, "a").also { write(it, "f.txt", "1") }
        val b = File(tmp, "b").also { write(it, "f.txt", "1"); File(it, "empty").mkdirs() }

        assertEquals(FolderHash.of(a), FolderHash.of(b))
    }

    @Test
    fun `excluded paths do not count`(@TempDir tmp: File) {
        val a = File(tmp, "a").also { write(it, "f.txt", "1") }
        val b = File(tmp, "b").also { write(it, "f.txt", "1"); write(it, "secret.json", "{}") }

        assertEquals(
            FolderHash.of(a),
            FolderHash.of(b) { it == "secret.json" },
        )
    }
}

class FileSkillsTest {

    private fun files(tmp: File): Pair<FileSkills, File> {
        val library = File(tmp, "library").apply { mkdirs() }
        return FileSkills(ClaudeHarnessService(library, File(tmp, "ws"))) to library
    }

    private fun skill(library: File, slug: String, md: String = "---\nname: $slug\ndescription: does $slug\n---\n# $slug\n") {
        File(library, "skills/$slug").apply { mkdirs() }
        File(library, "skills/$slug/SKILL.md").writeText(md)
    }

    @Test
    fun `a valid folder inspects as valid, with its slug, text and a hash`(@TempDir tmp: File) {
        val (skills, library) = files(tmp)
        skill(library, "handoff")

        val found = skills.inspect("skills/handoff") as SkillInspection.Valid

        assertEquals("handoff", found.slug)
        assertEquals("does handoff", found.description)
        assertEquals(64, found.hash.length)
    }

    @Test
    fun `an absolute path outside the library is read as given`(@TempDir tmp: File) {
        val (skills, _) = files(tmp)
        val elsewhere = File(tmp, "elsewhere/handoff").apply { mkdirs() }
        File(elsewhere, "SKILL.md").writeText("---\nname: handoff\ndescription: x\n---\n")

        assertTrue(skills.inspect(elsewhere.path) is SkillInspection.Valid)
        assertEquals(elsewhere.path, skills.normalizePath(elsewhere.path))
    }

    @Test
    fun `a path inside the library is stored relative to it`(@TempDir tmp: File) {
        val (skills, library) = files(tmp)
        skill(library, "handoff")

        assertEquals("skills/handoff", skills.normalizePath(File(library.canonicalFile, "skills/handoff").path))
    }

    @Test
    fun `each way a folder can be wrong has its own message`(@TempDir tmp: File) {
        val (skills, library) = files(tmp)

        fun problem(path: String) = (skills.inspect(path) as SkillInspection.Problem).message

        assertTrue(problem("skills/missing").contains("no folder"))

        File(library, "skills/Bad_Name").mkdirs()
        assertTrue(problem("skills/Bad_Name").contains("lowercase"))

        File(library, "skills/empty").mkdirs()
        assertTrue(problem("skills/empty").contains("no SKILL.md"))

        skill(library, "plain", md = "# no frontmatter\n")
        assertTrue(problem("skills/plain").contains("frontmatter"))

        skill(library, "noname", md = "---\ndescription: x\n---\n")
        assertTrue(problem("skills/noname").contains("no name"))

        skill(library, "nodesc", md = "---\nname: nodesc\n---\n")
        assertTrue(problem("skills/nodesc").contains("no description"))

        skill(library, "mismatch", md = "---\nname: other\ndescription: x\n---\n")
        assertTrue(problem("skills/mismatch").contains("must match the folder name"))
    }

    @Test
    fun `the hash follows the folder's content, including scripts`(@TempDir tmp: File) {
        val (skills, library) = files(tmp)
        skill(library, "handoff")
        val before = (skills.inspect("skills/handoff") as SkillInspection.Valid).hash

        File(library, "skills/handoff/scripts").mkdirs()
        File(library, "skills/handoff/scripts/run.py").writeText("print(1)")

        assertNotEquals(before, (skills.inspect("skills/handoff") as SkillInspection.Valid).hash)
    }

    @Test
    fun `the library listing finds folders under skills, valid or not, and skips hidden ones`(@TempDir tmp: File) {
        val (skills, library) = files(tmp)
        skill(library, "b")
        skill(library, "a")
        File(library, "skills/half").mkdirs()
        File(library, "skills/.hidden").mkdirs()
        File(library, "skills/loose.txt").writeText("not a folder")

        assertEquals(listOf("skills/a", "skills/b", "skills/half"), skills.libraryFolders())
    }

    @Test
    fun `an empty or missing skills folder lists nothing`(@TempDir tmp: File) {
        val (skills, _) = files(tmp)
        assertEquals(emptyList<String>(), skills.libraryFolders())
    }

    @Test
    fun `the body is the SKILL md text, or null when it is gone`(@TempDir tmp: File) {
        val (skills, library) = files(tmp)
        skill(library, "handoff")

        assertTrue(skills.readBody("skills/handoff")!!.contains("# handoff"))
        assertNull(skills.readBody("skills/nothing"))
    }

    @Test
    fun `a harness skill is found in the folders that runtime reads, and only those`(@TempDir tmp: File) {
        val (skills, library) = files(tmp)
        File(library, "harnesses/h/.claude/skills/in-claude").mkdirs()
        File(library, "harnesses/h/.pi/skills/in-pi").mkdirs()
        File(library, "harnesses/h/.opencode/skill/in-oc").mkdirs()

        assertTrue(skills.harnessHasSkill(AgentRuntime.claude_code, "harnesses/h", "in-claude"))
        assertFalse(skills.harnessHasSkill(AgentRuntime.claude_code, "harnesses/h", "in-pi"))
        assertTrue(skills.harnessHasSkill(AgentRuntime.pi, "harnesses/h", "in-pi"))
        // pi also reads .claude/skills.
        assertTrue(skills.harnessHasSkill(AgentRuntime.pi, "harnesses/h", "in-claude"))
        assertTrue(skills.harnessHasSkill(AgentRuntime.opencode, "harnesses/h", "in-oc"))
        // opencode does not read .claude/ from the instance.
        assertFalse(skills.harnessHasSkill(AgentRuntime.opencode, "harnesses/h", "in-claude"))
    }
}
