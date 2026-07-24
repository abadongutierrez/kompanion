package com.sdlcpaperclip.server.service

import com.sdlcpaperclip.server.dto.TeamSpendResponse
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

// Spend resets on calendar-month boundaries. "Current spend" is the sum of
// task_runs.cost_usd for runs against this team's tasks since the start of
// the current month — cost is only ever recorded for runs that actually
// invoked Claude, so over_budget refusals never count against themselves
// (they're inserted with cost_usd = 0).
@Service
class BudgetService(private val jdbc: JdbcTemplate) {

    fun getTeamSpend(teamId: UUID): TeamSpendResponse {
        val monthlyBudgetUsd = jdbc.query(
            "select monthly_budget_usd from teams where id = ?",
            { rs, _ -> rs.getBigDecimal("monthly_budget_usd") },
            teamId,
        ).firstOrNull()

        return jdbc.query(
            """
            select
              date_trunc('month', now()) as period_start,
              coalesce(sum(tr.cost_usd), 0) as spend_usd
            from task_runs tr
            join tasks t on t.id = tr.task_id
            where t.team_id = ?
              and tr.created_at >= date_trunc('month', now())
            """.trimIndent(),
            { rs, _ ->
                TeamSpendResponse(
                    teamId = teamId,
                    monthlyBudgetUsd = monthlyBudgetUsd,
                    spendUsd = rs.getBigDecimal("spend_usd") ?: BigDecimal.ZERO,
                    periodStart = rs.getObject("period_start", OffsetDateTime::class.java),
                )
            },
            teamId,
        ).first()
    }

    fun isOverBudget(teamId: UUID): Boolean {
        val spend = getTeamSpend(teamId)
        val budget = spend.monthlyBudgetUsd ?: return false
        return spend.spendUsd >= budget
    }
}
