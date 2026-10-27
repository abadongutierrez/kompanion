package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.domain.model.RuntimeSpend
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

// Against the real schema, like SkillsPersistenceTest: the grouping is SQL,
// which a fake store cannot check. Needs Postgres, and cleans up after
// itself (deleting the project cascades to its teams, tasks and runs).
@SpringBootTest
class SpendPersistenceTest(
    @Autowired val spend: JdbcSpendStore,
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

    @Test
    fun `each day is split by the runtime its runs used, and the split adds up`() {
        val projectId = jdbc.queryForObject(
            "insert into projects (name, workspace_path) values (?, ?) returning id",
            UUID::class.java, "p-$suffix", "projects/p-$suffix",
        )!!.also { projectIds += it }
        val teamId = jdbc.queryForObject(
            "insert into teams (project_id, name) values (?, 't') returning id", UUID::class.java, projectId,
        )!!
        val taskId = jdbc.queryForObject(
            "insert into tasks (team_id, title, type) values (?, 'task', 'story') returning id", UUID::class.java, teamId,
        )!!
        // The Agent is on pi now; the runs below say what they actually used.
        val agentId = jdbc.queryForObject(
            "insert into agents (title, slug, harness_path, runtime) values ('E', ?, 'harnesses/engineer', 'pi') returning id",
            UUID::class.java, "e-$suffix",
        )!!.also { agentIds += it }

        // The 1st and 2nd of the current month (UTC), whatever day it is: the
        // query has a lower bound only, so a day still ahead counts too.
        val monthStart = OffsetDateTime.now(ZoneOffset.UTC).withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS)
        val day1 = monthStart.plusHours(10)
        val day2 = monthStart.plusHours(34)

        fun run(at: OffsetDateTime, runtime: String, cost: String?) = jdbc.update(
            "insert into task_runs (task_id, agent_id, status, runtime, cost_usd, created_at) values (?, ?, 'succeeded', ?, ?, ?)",
            taskId, agentId, runtime, cost?.let(::BigDecimal), at,
        )

        run(day1, "claude_code", "0.5000")
        run(day1, "claude_code", "0.2500")
        run(day1, "pi", "0")
        run(day1, "opencode", null)
        run(day2, "claude_code", "1.1000")
        run(day2, "opencode2", "0.0100")

        val days = spend.projectDailySpend(projectId)

        days.forEach { d ->
            assertEquals(0, d.spendUsd.compareTo(d.byRuntime.fold(BigDecimal.ZERO) { a, r -> a + r.spendUsd }))
            assertEquals(d.runCount, d.byRuntime.sumOf { it.runCount })
        }

        val d1 = days.single { it.day == day1.toLocalDate().toString() }
        assertEquals(4, d1.runCount)
        assertEquals(0, BigDecimal("0.75").compareTo(d1.spendUsd))
        assertEquals(
            listOf("claude_code" to 2, "opencode" to 1, "pi" to 1),
            d1.byRuntime.map { it.runtime to it.runCount },
        )
        // Zero-cost runs are still there, at $0.
        assertEquals(0, BigDecimal.ZERO.compareTo(d1.byRuntime.single { it.runtime == "pi" }.spendUsd))
        assertEquals(0, BigDecimal.ZERO.compareTo(d1.byRuntime.single { it.runtime == "opencode" }.spendUsd))

        val d2 = days.single { it.day == day2.toLocalDate().toString() }
        assertEquals(listOf(d2.day, d1.day), days.map { it.day }) // newest day first
        assertEquals(2, d2.runCount)
        assertEquals(0, BigDecimal("1.11").compareTo(d2.spendUsd))
        // A runtime nothing else knows about yet still comes through.
        assertEquals(listOf("claude_code", "opencode2"), d2.byRuntime.map(RuntimeSpend::runtime))
    }

    @Test
    fun `the month is split per configured runtime, so two of one kind stay apart`() {
        val projectId = jdbc.queryForObject(
            "insert into projects (name, workspace_path) values (?, ?) returning id",
            UUID::class.java, "p-$suffix", "projects/p-$suffix",
        )!!.also { projectIds += it }
        val teamId = jdbc.queryForObject(
            "insert into teams (project_id, name) values (?, 't') returning id", UUID::class.java, projectId,
        )!!
        val taskId = jdbc.queryForObject(
            "insert into tasks (team_id, title, type) values (?, 'task', 'story') returning id", UUID::class.java, teamId,
        )!!
        val agentId = jdbc.queryForObject(
            "insert into agents (title, slug, harness_path, runtime) values ('E', ?, 'harnesses/engineer', 'claude_code') returning id",
            UUID::class.java, "e-$suffix",
        )!!.also { agentIds += it }
        fun runtime(name: String) = jdbc.queryForObject(
            "insert into runtimes (name, kind) values (?, 'claude_code') returning id", UUID::class.java, name,
        )!!
        val work = runtime("Work $suffix")
        val personal = runtime("Personal $suffix")
        val gone = UUID.randomUUID() // a Runtime deleted since its runs

        fun run(runtimeId: UUID?, cost: String) = jdbc.update(
            "insert into task_runs (task_id, agent_id, status, runtime, runtime_id, cost_usd) values (?, ?, 'succeeded', 'claude_code', ?, ?)",
            taskId, agentId, runtimeId, BigDecimal(cost),
        )

        try {
            run(work, "1.0000")
            run(work, "0.5000")
            run(personal, "0.2500")
            run(gone, "0.1000")
            run(null, "0.0500")

            val rows = spend.projectMonthSpendByConfiguredRuntime(projectId)

            assertEquals(
                listOf(
                    Triple(work, "Work $suffix", 2),
                    Triple(personal, "Personal $suffix", 1),
                    Triple(gone, null, 1),
                    Triple(null, null, 1),
                ),
                rows.map { Triple(it.runtimeId, it.runtimeName, it.runCount) },
            )
            assertEquals(0, BigDecimal("1.5").compareTo(rows.first().spendUsd))
            rows.forEach { assertEquals("claude_code", it.runtime) }
        } finally {
            projectIds.remove(projectId)
            jdbc.update("delete from projects where id = ?", projectId)
            jdbc.update("delete from runtimes where id in (?, ?)", work, personal)
        }
    }
}
