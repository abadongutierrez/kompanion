package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.RunStore
import com.kompanion.server.domain.model.AbandonedRun
import com.kompanion.server.domain.model.ActiveRun
import com.kompanion.server.domain.model.RunProcess
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

// Joins across task_runs, tasks, teams and agents — the hybrid JdbcTemplate
// case, like JdbcSpendStore, and for the same reason it hops through teams
// to reach the project.
//
// "Active" needs both signals: the run row at status 'running' and its task
// still holding running_since. RunTaskService clears both when a run ends.
// A server killed mid-run leaves both set; the next boot clears them (see
// ReconcileAbandonedRunsUseCase). Requiring both here still hides a row
// whose task was freed some other way.
@Component
class JdbcRunStore(private val jdbc: JdbcTemplate) : RunStore {

    override fun activeRuns(projectId: UUID): List<ActiveRun> = jdbc.query(
        """
        select
          tr.id as run_id,
          t.id as task_id,
          t.title as task_title,
          tm.id as team_id,
          tm.name as team_name,
          a.title as agent_title,
          tr.runtime as runtime,
          tr.model as model,
          tr.created_at as started_at
        from task_runs tr
        join tasks t on t.id = tr.task_id
        join teams tm on tm.id = t.team_id
        left join agents a on a.id = tr.agent_id
        where tm.project_id = ?
          and tr.status = 'running'
          and t.running_since is not null
        order by tr.created_at
        """.trimIndent(),
        { rs, _ ->
            ActiveRun(
                runId = UUID.fromString(rs.getString("run_id")),
                taskId = UUID.fromString(rs.getString("task_id")),
                taskTitle = rs.getString("task_title"),
                teamId = UUID.fromString(rs.getString("team_id")),
                teamName = rs.getString("team_name"),
                agentTitle = rs.getString("agent_title"),
                runtime = rs.getString("runtime"),
                model = rs.getString("model"),
                startedAt = rs.getObject("started_at", OffsetDateTime::class.java),
            )
        },
        projectId,
    )

    override fun abandonedRuns(): List<AbandonedRun> = jdbc.query(
        "select id, task_id, pid, process_started_at from task_runs where status = 'running'",
        { rs, _ ->
            val pid = rs.getLong("pid").takeUnless { rs.wasNull() }
            AbandonedRun(
                runId = UUID.fromString(rs.getString("id")),
                taskId = UUID.fromString(rs.getString("task_id")),
                process = pid?.let {
                    RunProcess(it, rs.getObject("process_started_at", OffsetDateTime::class.java)?.toInstant())
                },
            )
        },
    )

    override fun failAbandonedRuns(runIds: List<UUID>, summary: String) {
        jdbc.batchUpdate(
            "update task_runs set status = 'failed', summary = ? where id = ? and status = 'running'",
            runIds.map { arrayOf<Any>(summary, it) },
        )
        jdbc.update(
            """
            update tasks set running_since = null
            where running_since is not null
              and not exists (select 1 from task_runs tr where tr.task_id = tasks.id and tr.status = 'running')
            """.trimIndent(),
        )
    }
}
