package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.domain.model.AgentInstance
import com.kompanion.server.domain.model.LoadedSkill
import com.kompanion.server.domain.model.Skill
import com.kompanion.server.domain.model.SkillOutcome
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

// Against the real schema, like ServerApplicationTests: the SQL in the two
// JDBC adapters is the thing a fake store cannot check. Needs Postgres, and
// cleans up after itself (agents and skills have no delete endpoint, so the
// rows must not outlive the test).
@SpringBootTest
class SkillsPersistenceTest(
    @Autowired val skills: JdbcSkillStore,
    @Autowired val runInstances: JdbcRunInstances,
    @Autowired val jdbc: JdbcTemplate,
) {

    private val suffix = UUID.randomUUID().toString().take(8)
    private val projectIds = mutableListOf<UUID>()
    private val agentIds = mutableListOf<UUID>()
    private val skillIds = mutableListOf<UUID>()

    @AfterEach
    fun cleanUp() {
        // Order matters: the restrict on agent_skills.skill_id is the point.
        agentIds.forEach { jdbc.update("delete from agents where id = ?", it) }
        skillIds.forEach { jdbc.update("delete from skills where id = ?", it) }
        projectIds.forEach { jdbc.update("delete from projects where id = ?", it) }
    }

    private fun newSkill(slug: String): Skill =
        skills.save(Skill(slug = "$slug-$suffix", name = slug, description = "d", skillPath = "skills/$slug")).also {
            skillIds += it.id!!
        }

    private fun newAgent(title: String): UUID {
        val id = jdbc.queryForObject(
            "insert into agents (title, slug, harness_path) values (?, ?, 'harnesses/engineer') returning id",
            UUID::class.java,
            title, "${title.lowercase()}-$suffix",
        )!!
        agentIds += id
        return id
    }

    private fun newRun(agentId: UUID): UUID {
        val projectId = jdbc.queryForObject(
            "insert into projects (name, workspace_path) values (?, ?) returning id",
            UUID::class.java, "p-$suffix", "projects/p-$suffix",
        )!!
        projectIds += projectId
        val teamId = jdbc.queryForObject(
            "insert into teams (project_id, name) values (?, 't') returning id", UUID::class.java, projectId,
        )!!
        val taskId = jdbc.queryForObject(
            "insert into tasks (team_id, title, type) values (?, 'task', 'story') returning id", UUID::class.java, teamId,
        )!!
        return jdbc.queryForObject(
            "insert into task_runs (task_id, agent_id, status) values (?, ?, 'running') returning id",
            UUID::class.java, taskId, agentId,
        )!!
    }

    // -- the skill store ------------------------------------------------

    @Test
    fun `a saved skill reads back with its created date, by id and by slug`() {
        val saved = newSkill("handoff")

        assertEquals(saved.slug, skills.findById(saved.id!!)!!.slug)
        assertEquals(saved.id, skills.findBySlug(saved.slug)!!.id)
        assertEquals(true, saved.createdAt != null)
    }

    @Test
    fun `the slug is unique`() {
        val first = newSkill("dup")
        assertThrows(Exception::class.java) {
            skills.save(Skill(slug = first.slug, name = "x", description = "d", skillPath = "skills/other"))
        }
    }

    @Test
    fun `an agent's skills come back in slug order, and assigning replaces the set`() {
        val agent = newAgent("Engineer")
        val b = newSkill("b")
        val a = newSkill("a")
        val c = newSkill("c")

        skills.replaceAssignments(agent, listOf(b.id!!, a.id!!))
        assertEquals(listOf(a.slug, b.slug), skills.skillsFor(agent).map { it.slug })

        skills.replaceAssignments(agent, listOf(c.id!!))
        assertEquals(listOf(c.slug), skills.skillsFor(agent).map { it.slug })

        skills.replaceAssignments(agent, emptyList())
        assertEquals(emptyList<String>(), skills.skillsFor(agent).map { it.slug })
    }

    @Test
    fun `the titles of the agents using a skill are listed, in order`() {
        val skill = newSkill("shared")
        val zed = newAgent("Zed")
        val amy = newAgent("Amy")
        skills.replaceAssignments(zed, listOf(skill.id!!))
        skills.replaceAssignments(amy, listOf(skill.id!!))

        assertEquals(listOf("Amy", "Zed"), skills.agentTitlesUsing(skill.id!!))
    }

    @Test
    fun `the database itself refuses to delete a skill that is still assigned`() {
        val skill = newSkill("held")
        val agent = newAgent("Holder")
        skills.replaceAssignments(agent, listOf(skill.id!!))

        assertThrows(DataIntegrityViolationException::class.java) { skills.delete(skill.id!!) }

        skills.replaceAssignments(agent, emptyList())
        skills.delete(skill.id!!)
        assertNull(skills.findById(skill.id!!))
    }

    @Test
    fun `deleting an agent drops its assignments but not the skill`() {
        val skill = newSkill("kept")
        val agent = newAgent("Leaver")
        skills.replaceAssignments(agent, listOf(skill.id!!))

        jdbc.update("delete from agents where id = ?", agent)

        assertEquals(emptyList<String>(), skills.agentTitlesUsing(skill.id!!))
        assertEquals(skill.slug, skills.findById(skill.id!!)!!.slug)
    }

    // -- recording what a run was built from ---------------------------

    private fun runRow(runId: UUID) = jdbc.queryForMap(
        "select instance_hash, git_sha, git_dirty from task_runs where id = ?", runId,
    )

    private fun runSkills(runId: UUID): Map<String, Pair<String?, String>> = jdbc.query(
        "select skill_slug, skill_hash, outcome from task_run_skills where run_id = ? order by skill_slug",
        { rs, _ -> rs.getString("skill_slug") to (rs.getString("skill_hash") to rs.getString("outcome")) },
        runId,
    ).toMap()

    @Test
    fun `recording writes the hash, the git facts and one row per skill with its outcome`() {
        val run = newRun(newAgent("Recorder"))
        val instance = AgentInstance(
            hash = "instance-hash",
            skills = listOf(
                LoadedSkill("a", "hash-a", SkillOutcome.loaded),
                LoadedSkill("b", "hash-b", SkillOutcome.skipped_harness_has_it),
                LoadedSkill("c", null, SkillOutcome.missing),
            ),
            gitSha = "abc123",
            gitDirty = true,
        )

        runInstances.record(run, instance)

        val row = runRow(run)
        assertEquals("instance-hash", row["instance_hash"])
        assertEquals("abc123", row["git_sha"])
        assertEquals(true, row["git_dirty"])
        assertEquals(
            mapOf(
                "a" to ("hash-a" to "loaded"),
                "b" to ("hash-b" to "skipped_harness_has_it"),
                "c" to (null to "missing"),
            ),
            runSkills(run),
        )
    }

    @Test
    fun `recording twice leaves one answer, and missing git facts stay null`() {
        val run = newRun(newAgent("Twice"))

        runInstances.record(run, AgentInstance("h1", listOf(LoadedSkill("a", "x", SkillOutcome.loaded)), "sha", false))
        runInstances.record(run, AgentInstance("h2", listOf(LoadedSkill("z", "y", SkillOutcome.loaded)), null, null))

        val row = runRow(run)
        assertEquals("h2", row["instance_hash"])
        assertNull(row["git_sha"])
        assertNull(row["git_dirty"])
        assertEquals(setOf("z"), runSkills(run).keys)
    }

    @Test
    fun `an instance with no skills records no skill rows`() {
        val run = newRun(newAgent("Bare"))

        runInstances.record(run, AgentInstance("h", emptyList(), null, null))

        assertEquals("h", runRow(run)["instance_hash"])
        assertEquals(emptyMap<String, Pair<String?, String>>(), runSkills(run))
    }

    @Test
    fun `the outcome column only accepts the three known outcomes`() {
        val run = newRun(newAgent("Strict"))

        assertThrows(DataIntegrityViolationException::class.java) {
            jdbc.update(
                "insert into task_run_skills (run_id, skill_slug, skill_hash, outcome) values (?, 'a', 'h', 'exploded')",
                run,
            )
        }
    }
}
