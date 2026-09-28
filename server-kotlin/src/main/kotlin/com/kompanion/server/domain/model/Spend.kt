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
data class DaySpend(
    val day: String,
    val spendUsd: BigDecimal,
    val runCount: Int,
)
