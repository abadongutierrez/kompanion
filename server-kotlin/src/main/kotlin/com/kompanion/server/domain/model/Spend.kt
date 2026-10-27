package com.kompanion.server.domain.model

import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

// What a project has cost. All time, because that is the question the
// Budget tab asks; the month-to-date figure rides along because the caps
// that refuse runs are monthly and are still enforced per team.
data class ProjectSpend(
    val projectId: UUID,
    val totalSpendUsd: BigDecimal,
    val totalRunCount: Int,
    val monthSpendUsd: BigDecimal,
    val periodStart: OffsetDateTime,
)

// One day of the current month. `day` is a plain YYYY-MM-DD string: the
// grouping happens in the database's timezone and the value is a label, not
// an instant anything is computed from.
//
// byRuntime splits the day by task_runs.runtime — the CLI the run actually
// used, not whatever its Agent is set to now. The day's totals are summed
// from it, so the split always adds up to them exactly.
data class DaySpend(
    val day: String,
    val spendUsd: BigDecimal,
    val runCount: Int,
    val byRuntime: List<RuntimeSpend> = emptyList(),
)

// `runtime` is free text on purpose: a runtime added later shows up here
// before anything else in the app has heard of it.
data class RuntimeSpend(
    val runtime: String,
    val spendUsd: BigDecimal,
    val runCount: Int,
)

// One configured Runtime's share of the current month, for the sidebar.
// runtimeId is task_runs.runtime_id: null when the run's Agent named no
// runtime (the CLI defaults) or the run predates V28. runtimeName is the
// Runtime's name today, null if it has been deleted since — its spend still
// counts.
data class ConfiguredRuntimeSpend(
    val runtimeId: UUID?,
    val runtime: String,
    val runtimeName: String?,
    val spendUsd: BigDecimal,
    val runCount: Int,
)
