package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.ConfiguredRuntimeSpend
import com.kompanion.server.domain.model.DaySpend
import com.kompanion.server.domain.model.ProjectSpend
import java.util.UUID

// What a project has spent, across every team under it. The per-team
// equivalent lives in the legacy BudgetService and stays there: it feeds the
// board's over-budget gate, which is a different question.
interface GetProjectSpend {
    fun handle(query: GetProjectSpendQuery): ProjectSpendView
}

data class GetProjectSpendQuery(val projectId: UUID)

// The totals plus the per-day and per-configured-runtime breakdowns. A
// controller may call exactly one use case and the wire response carries all
// three, so assembling them is the use case's job — same reason
// TaskWithRepositories exists.
data class ProjectSpendView(
    val spend: ProjectSpend,
    val byDay: List<DaySpend>,
    val byConfiguredRuntime: List<ConfiguredRuntimeSpend> = emptyList(),
)
