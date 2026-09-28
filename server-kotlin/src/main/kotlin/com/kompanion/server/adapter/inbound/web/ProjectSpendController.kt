package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.GetProjectSpend
import com.kompanion.server.application.port.inbound.GetProjectSpendQuery
import com.kompanion.server.application.port.inbound.ProjectSpendView
import com.kompanion.server.domain.model.DaySpend
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

// One round trip for the whole Budget tab: the project's all-time total, the
// month-to-date figure, and the per-day breakdown of that month. Splitting
// them the way the legacy team endpoints do would buy nothing here — the
// panel always renders all three.
//
// New endpoint, so it is built in the ARCHITECTURE.md layout from the start,
// including its wire DTOs: the legacy TeamBudgetController and its dto/
// types are untouched.
@RestController
@RequestMapping("/api/projects/{projectId}/spend")
class ProjectSpendController(private val getProjectSpend: GetProjectSpend) {

    @GetMapping
    fun spend(@PathVariable projectId: UUID): ProjectSpendResponse =
        getProjectSpend.handle(GetProjectSpendQuery(projectId)).toResponse()
}

data class ProjectSpendResponse(
    val projectId: UUID,
    val totalSpendUsd: BigDecimal,
    val totalRunCount: Int,
    val monthSpendUsd: BigDecimal,
    val periodStart: OffsetDateTime,
    val byDay: List<DaySpendResponse>,
)

data class DaySpendResponse(
    val day: String,
    val spendUsd: BigDecimal,
    val runCount: Int,
)

// Domain -> wire. Separate types on purpose, same as TaskStatusController's:
// a domain refactor must not be able to silently reshape a JSON payload.
private fun ProjectSpendView.toResponse() = ProjectSpendResponse(
    projectId = spend.projectId,
    totalSpendUsd = spend.totalSpendUsd,
    totalRunCount = spend.totalRunCount,
    monthSpendUsd = spend.monthSpendUsd,
    periodStart = spend.periodStart,
    byDay = byDay.map { it.toResponse() },
)

private fun DaySpend.toResponse() = DaySpendResponse(day, spendUsd, runCount)
