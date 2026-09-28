package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.SpendStore
import com.kompanion.server.domain.model.DaySpend
import com.kompanion.server.domain.model.ProjectSpend
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

// A rollup that spans three tables and belongs to no single aggregate — the
// hybrid JdbcTemplate case ARCHITECTURE.md sanctions for this package,
// mapped to domain types before anything crosses the boundary.
//
// `tasks` carries no project_id (V1__init.sql), so a project rollup has to
// hop task_runs -> tasks -> teams and filter on teams.project_id.
//
// Two behaviours are deliberate and shared with the legacy per-team
// BudgetService, which still owns the over-budget gate: cost_usd is null or
// zero for runs that never invoked a CLI, so an over_budget refusal never
// counts against itself; and a day with runs but no recorded cost still
// shows up, because count(*) counts rows while sum(cost_usd) coalesces.
@Component
class JdbcSpendStore(private val jdbc: JdbcTemplate) : SpendStore {

    override fun projectSpend(projectId: UUID): ProjectSpend = jdbc.query(
        """
        select
          date_trunc('month', now()) as period_start,
          coalesce(sum(tr.cost_usd), 0) as total_spend_usd,
          count(*) as total_run_count,
          coalesce(sum(tr.cost_usd) filter (
            where tr.created_at >= date_trunc('month', now())), 0) as month_spend_usd
        from task_runs tr
        join tasks t on t.id = tr.task_id
        join teams tm on tm.id = t.team_id
        where tm.project_id = ?
        """.trimIndent(),
        { rs, _ ->
            ProjectSpend(
                projectId = projectId,
                totalSpendUsd = rs.getBigDecimal("total_spend_usd") ?: BigDecimal.ZERO,
                totalRunCount = rs.getInt("total_run_count"),
                monthSpendUsd = rs.getBigDecimal("month_spend_usd") ?: BigDecimal.ZERO,
                periodStart = rs.getObject("period_start", OffsetDateTime::class.java),
            )
        },
        projectId,
    ).first()

    override fun projectDailySpend(projectId: UUID): List<DaySpend> = jdbc.query(
        """
        select
          to_char(date_trunc('day', tr.created_at), 'YYYY-MM-DD') as day,
          coalesce(sum(tr.cost_usd), 0) as spend_usd,
          count(*) as run_count
        from task_runs tr
        join tasks t on t.id = tr.task_id
        join teams tm on tm.id = t.team_id
        where tm.project_id = ?
          and tr.created_at >= date_trunc('month', now())
        group by 1
        order by 1 desc
        """.trimIndent(),
        { rs, _ ->
            DaySpend(
                day = rs.getString("day"),
                spendUsd = rs.getBigDecimal("spend_usd") ?: BigDecimal.ZERO,
                runCount = rs.getInt("run_count"),
            )
        },
        projectId,
    )
}
