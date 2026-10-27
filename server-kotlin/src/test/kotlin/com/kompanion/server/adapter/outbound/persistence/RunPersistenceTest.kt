package com.kompanion.server.adapter.outbound.persistence

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

// Against the real schema, like SpendPersistenceTest: which runs count as
// active is decided in SQL. Needs Postgres, and cleans up after itself.
@SpringBootTest
class RunPersistenceTest(
    @Autowired val runs: JdbcRunStore,
    @Autowired val jdbc: JdbcTemplate,
) {

    private val suffix = UUID.randomUUID().toString().take(8)
    private val projectIds = mutableListOf<UUID>()
    private val agentIds = mutableListOf<UUID>()

    @AfterEach
    fun cleanUp() {
        projectIds.forEach { jdbc.update("delete from projects where id = ?", it) }
        agentIds.forEach { jdbc.update("delete from agents where id = ?", it) }
    }

    private fun project(name: String): UUID = jdbc.queryForObject(
        "insert into projects (name, workspace_path) values (?, ?) returning id",
        UUID::class.java, "$name-$suffix", "projects/$name-$suffix",
    )!!.also { projectIds += it }

    private fun team(projectId: UUID, name: String): UUID = jdbc.queryForObject(
        "insert into teams (project_id, name) values (?, ?) returning id", UUID::class.java, projectId, name,
    )!!

    private fun task(teamId: UUID, title: String, running: Boolean): UUID = jdbc.queryForObject(
        "insert into tasks (team_id, title, type, running_since) values (?, ?, 'story', ${if (running) "now()" else "null"}) returning id",
        UUID::class.java, teamId, title,
    )!!

    private fun run(taskId: UUID, agentId: UUID, status: String): UUID = jdbc.queryForObject(
        "insert into task_runs (task_id, agent_id, status, runtime, model) values (?, ?, ?, 'claude_code', 'opus') returning id",
        UUID::class.java, taskId, agentId, status,
    )!!

    @Test
    fun `only runs in flight in this project are active`() {
        val projectId = project("p")
        val agentId = jdbc.queryForObject(
            "insert into agents (title, slug, harness_path) values ('Engineer', ?, 'harnesses/engineer') returning id",
            UUID::class.java, "e-$suffix",
        )!!.also { agentIds += it }

        val core = team(projectId, "Core")
        val live = task(core, "live", running = true)
        val liveRun = run(live, agentId, "running")
        run(live, agentId, "succeeded")
        // A server killed mid-run leaves the row at 'running' but the task free.
        run(task(core, "ghost", running = false), agentId, "running")

        val elsewhere = team(project("other"), "Other")
        run(task(elsewhere, "other project", running = true), agentId, "running")

        val active = runs.activeRuns(projectId)

        assertEquals(listOf(liveRun), active.map { it.runId })
        val only = active.single()
        assertEquals("live", only.taskTitle)
        assertEquals("Core", only.teamName)
        assertEquals("Engineer", only.agentTitle)
        assertEquals("claude_code", only.runtime)
        assertEquals("opus", only.model)
    }
}
