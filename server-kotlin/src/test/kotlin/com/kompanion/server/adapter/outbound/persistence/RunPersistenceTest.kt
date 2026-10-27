package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.repository.RepositoryRepository
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.OffsetDateTime
import java.util.UUID

// Against the real schema, like SpendPersistenceTest: which runs count as
// active is decided in SQL. Needs Postgres, and cleans up after itself.
@SpringBootTest
class RunPersistenceTest(
    @Autowired val runs: JdbcRunStore,
    @Autowired val jdbc: JdbcTemplate,
    @Autowired val txManager: PlatformTransactionManager,
    @Autowired val repositories: RepositoryRepository,
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

    @Test
    fun `a run cut off by a crash is failed and its task freed`() {
        val projectId = project("crash")
        val agentId = jdbc.queryForObject(
            "insert into agents (title, slug, harness_path) values ('Engineer', ?, 'harnesses/engineer') returning id",
            UUID::class.java, "c-$suffix",
        )!!.also { agentIds += it }
        val core = team(projectId, "Core")
        // What a hard crash leaves: both signals still set.
        val taskId = task(core, "crashed", running = true)
        val runId = run(taskId, agentId, "running")
        // Its CLI could not be shown to be gone, so it keeps its task.
        val survivorTask = task(core, "survivor", running = true)
        val survivorRun = run(survivorTask, agentId, "running")

        val found = runs.abandonedRuns().associateBy({ it.runId }, { it.taskId })
        assertEquals(taskId, found[runId])
        assertEquals(survivorTask, found[survivorRun])

        // failAbandonedRuns frees claims across the whole database, and tests
        // share the dev database with a server that may be mid-run. Roll it back.
        TransactionTemplate(txManager).executeWithoutResult { tx ->
            runs.failAbandonedRuns(listOf(runId), "server restarted")

            assertEquals(listOf(survivorRun), runs.activeRuns(projectId).map { it.runId })
            assertEquals(
                "failed",
                jdbc.queryForObject("select status from task_runs where id = ?", String::class.java, runId),
            )
            assertEquals(
                "server restarted",
                jdbc.queryForObject("select summary from task_runs where id = ?", String::class.java, runId),
            )
            assertNull(
                jdbc.queryForObject(
                    "select running_since from tasks where id = ?", OffsetDateTime::class.java, taskId,
                ),
            )
            assertNotNull(
                jdbc.queryForObject(
                    "select running_since from tasks where id = ?", OffsetDateTime::class.java, survivorTask,
                ),
            )

            tx.setRollbackOnly()
        }
    }

    // Guards RepositoryController's refusal to move a repository mid-run.
    @Test
    fun `a project has a running task while any of its tasks holds a claim`() {
        val idle = project("idle")
        task(team(idle, "Core"), "idle", running = false)
        val busy = project("busy")
        task(team(busy, "Core"), "busy", running = true)

        assertFalse(repositories.projectHasRunningTask(idle))
        assertTrue(repositories.projectHasRunningTask(busy))
    }
}
