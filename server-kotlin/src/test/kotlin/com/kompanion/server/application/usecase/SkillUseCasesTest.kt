package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.AssignSkillsCommand
import com.kompanion.server.application.port.inbound.RegisterSkillCommand
import com.kompanion.server.application.port.outbound.SkillInspection
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Skill
import com.kompanion.server.fake.FakeSkillFiles
import com.kompanion.server.fake.InMemoryAgentStore
import com.kompanion.server.fake.InMemorySkillStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.util.UUID

class SkillUseCasesTest {

    private fun skill(slug: String, path: String = "skills/$slug") =
        Skill(id = UUID.randomUUID(), slug = slug, name = slug, description = "old text", skillPath = path)

    // -- register -------------------------------------------------------

    @Test
    fun `registering a valid folder stores its slug, text and a normalized path`() {
        val files = FakeSkillFiles().apply { valid("/library/skills/handoff", "handoff", description = "writes handoffs") }
        val skills = InMemorySkillStore()

        val view = RegisterSkillUseCase(skills, files).handle(RegisterSkillCommand("/library/skills/handoff"))

        assertFalse(view.broken)
        assertEquals("handoff", view.skill.slug)
        assertEquals("writes handoffs", view.skill.description)
        assertEquals("skills/handoff", view.skill.skillPath)
        assertNotNull(skills.findBySlug("handoff"))
    }

    @Test
    fun `an invalid folder is refused with the reason, and nothing is saved`() {
        val files = FakeSkillFiles().apply {
            folders["skills/bad"] = SkillInspection.Problem("skills/bad has no SKILL.md")
        }
        val skills = InMemorySkillStore()

        val e = assertThrows<DomainException.Invalid> {
            RegisterSkillUseCase(skills, files).handle(RegisterSkillCommand("skills/bad"))
        }

        assertEquals("skills/bad has no SKILL.md", e.message)
        assertTrue(skills.findAll().isEmpty())
    }

    @Test
    fun `a slug that is registered from another folder is refused`() {
        val files = FakeSkillFiles().apply { valid("/elsewhere/handoff", "handoff") }
        val skills = InMemorySkillStore(skill("handoff", path = "skills/handoff"))

        assertThrows<DomainException.Conflict> {
            RegisterSkillUseCase(skills, files).handle(RegisterSkillCommand("/elsewhere/handoff"))
        }
        assertEquals(1, skills.findAll().size)
    }

    @Test
    fun `registering the same folder again refreshes the row instead of failing`() {
        val files = FakeSkillFiles().apply { valid("skills/handoff", "handoff", description = "new text") }
        val skills = InMemorySkillStore(skill("handoff"))

        val view = RegisterSkillUseCase(skills, files).handle(RegisterSkillCommand("skills/handoff"))

        assertEquals("new text", view.skill.description)
        assertEquals(1, skills.findAll().size)
    }

    // -- scan -----------------------------------------------------------

    @Test
    fun `scan registers new valid folders, refreshes old rows and reports broken ones`() {
        val files = FakeSkillFiles().apply {
            valid("skills/new-one", "new-one")
            valid("skills/changed", "changed", description = "fresh text")
            valid("skills/same", "same", description = "old text")
            folders["skills/half-written"] = SkillInspection.Problem("no SKILL.md")
            libraryPaths += listOf("skills/new-one", "skills/changed", "skills/same", "skills/half-written")
            // "gone" has a row but no folder: inspect() says "no folder".
        }
        val skills = InMemorySkillStore(skill("changed"), skill("same"), skill("gone"))

        val result = ScanSkillsUseCase(skills, files).handle()

        assertEquals(listOf("new-one"), result.registered.map { it.skill.slug })
        assertEquals(listOf("changed"), result.refreshed.map { it.skill.slug })
        assertEquals(listOf("gone"), result.broken.map { it.skill.slug })
        assertEquals("fresh text", skills.findBySlug("changed")!!.description)
        // The invalid folder was skipped quietly, and nothing was deleted.
        assertEquals(null, skills.findBySlug("half-written"))
        assertTrue(skills.deleted.isEmpty())
        assertNotNull(skills.findBySlug("gone"))
    }

    @Test
    fun `scan twice registers nothing the second time`() {
        val files = FakeSkillFiles().apply {
            valid("skills/a", "a")
            libraryPaths += "skills/a"
        }
        val skills = InMemorySkillStore()
        val scan = ScanSkillsUseCase(skills, files)

        assertEquals(1, scan.handle().registered.size)
        assertTrue(scan.handle().registered.isEmpty())
    }

    // -- list and detail ------------------------------------------------

    @Test
    fun `a row whose folder is gone is listed as broken`() {
        val files = FakeSkillFiles().apply { valid("skills/ok", "ok") }
        val skills = InMemorySkillStore(skill("ok"), skill("lost"))

        val views = ListSkillsUseCase(skills, files).handle()

        assertEquals(listOf("lost", "ok"), views.map { it.skill.slug })
        assertTrue(views.first { it.skill.slug == "lost" }.broken)
        assertFalse(views.first { it.skill.slug == "ok" }.broken)
    }

    @Test
    fun `detail carries the SKILL md text`() {
        val files = FakeSkillFiles().apply {
            valid("skills/ok", "ok")
            bodies["skills/ok"] = "# the body"
        }
        val row = skill("ok")

        val detail = GetSkillUseCase(InMemorySkillStore(row), files).handle(row.id!!)

        assertEquals("# the body", detail.body)
    }

    @Test
    fun `detail of an unknown skill is not found`() {
        assertThrows<DomainException.NotFound> {
            GetSkillUseCase(InMemorySkillStore(), FakeSkillFiles()).handle(UUID.randomUUID())
        }
    }

    // -- unregister -----------------------------------------------------

    @Test
    fun `unregistering an assigned skill is refused and names the agents`() {
        val row = skill("handoff")
        val skills = InMemorySkillStore(row).apply { titlesBySkill[row.id!!] = listOf("Engineer", "QA") }

        val e = assertThrows<DomainException.Conflict> { UnregisterSkillUseCase(skills).handle(row.id!!) }

        assertTrue(e.message!!.contains("Engineer, QA"))
        assertTrue(skills.deleted.isEmpty())
    }

    @Test
    fun `unregistering an unassigned skill removes the row`() {
        val row = skill("handoff")
        val skills = InMemorySkillStore(row)

        UnregisterSkillUseCase(skills).handle(row.id!!)

        assertEquals(listOf(row.id), skills.deleted)
    }

    @Test
    fun `unregistering an unknown skill is not found`() {
        assertThrows<DomainException.NotFound> {
            UnregisterSkillUseCase(InMemorySkillStore()).handle(UUID.randomUUID())
        }
    }

    // -- assign ---------------------------------------------------------

    private val agent = Agent(
        id = UUID.randomUUID(),
        title = "Engineer",
        slug = "engineer",
        harnessPath = "harnesses/engineer",
        runtime = AgentRuntime.claude_code,
    )

    private fun assign(files: FakeSkillFiles, skills: InMemorySkillStore) =
        AssignSkillsUseCase(InMemoryAgentStore(agent), skills, files)

    @Test
    fun `assigning replaces the whole set`() {
        val a = skill("a")
        val b = skill("b")
        val c = skill("c")
        val files = FakeSkillFiles().apply { valid("skills/a", "a"); valid("skills/b", "b"); valid("skills/c", "c") }
        val skills = InMemorySkillStore(a, b, c)

        assign(files, skills).handle(AssignSkillsCommand(agent.id!!, listOf(a.id!!, b.id!!)))
        val result = assign(files, skills).handle(AssignSkillsCommand(agent.id!!, listOf(b.id!!, c.id!!)))

        assertEquals(listOf("b", "c"), result.map { it.skill.skill.slug })
        assertEquals(listOf("b", "c"), skills.skillsFor(agent.id!!).map { it.slug })
    }

    @Test
    fun `assigning an empty list un-teaches everything`() {
        val a = skill("a")
        val skills = InMemorySkillStore(a)
        skills.replaceAssignments(agent.id!!, listOf(a.id!!))

        val result = assign(FakeSkillFiles(), skills).handle(AssignSkillsCommand(agent.id!!, emptyList()))

        assertTrue(result.isEmpty())
    }

    @Test
    fun `assigning the same skill twice in one list counts it once`() {
        val a = skill("a")
        val files = FakeSkillFiles().apply { valid("skills/a", "a") }
        val skills = InMemorySkillStore(a)

        val result = assign(files, skills).handle(AssignSkillsCommand(agent.id!!, listOf(a.id!!, a.id!!)))

        assertEquals(1, result.size)
    }

    @Test
    fun `an unknown skill id is refused and nothing changes`() {
        val a = skill("a")
        val skills = InMemorySkillStore(a)
        skills.replaceAssignments(agent.id!!, listOf(a.id!!))

        assertThrows<DomainException.Invalid> {
            assign(FakeSkillFiles(), skills).handle(AssignSkillsCommand(agent.id!!, listOf(UUID.randomUUID())))
        }
        assertEquals(listOf("a"), skills.skillsFor(agent.id!!).map { it.slug })
    }

    @Test
    fun `assigning to an unknown agent is not found`() {
        assertThrows<DomainException.NotFound> {
            assign(FakeSkillFiles(), InMemorySkillStore()).handle(AssignSkillsCommand(UUID.randomUUID(), emptyList()))
        }
    }

    @Test
    fun `an assigned skill the harness already has is flagged as shadowed`() {
        val a = skill("a")
        val b = skill("b")
        val files = FakeSkillFiles().apply {
            valid("skills/a", "a")
            valid("skills/b", "b")
            harnessSkills += Triple(AgentRuntime.claude_code, "harnesses/engineer", "a")
        }
        val skills = InMemorySkillStore(a, b)

        val result = assign(files, skills).handle(AssignSkillsCommand(agent.id!!, listOf(a.id!!, b.id!!)))

        assertEquals(mapOf("a" to true, "b" to false), result.associate { it.skill.skill.slug to it.shadowedByHarness })
    }

    @Test
    fun `listing an agent's skills reports broken ones too`() {
        val gone = skill("gone")
        val skills = InMemorySkillStore(gone)
        skills.replaceAssignments(agent.id!!, listOf(gone.id!!))

        val result = ListAgentSkillsUseCase(InMemoryAgentStore(agent), skills, FakeSkillFiles()).handle(agent.id!!)

        assertTrue(result.single().skill.broken)
    }
}
