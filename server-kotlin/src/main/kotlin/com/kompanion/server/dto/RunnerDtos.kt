package com.kompanion.server.dto

import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

data class BuiltinHarnessResponse(val slug: String, val title: String, val path: String)

data class TaskRunResponse(
    val id: UUID,
    val taskId: UUID,
    val roleId: UUID,
    val status: String,
    val summary: String?,
    val rawOutput: Any?,
    val costUsd: BigDecimal?,
    val durationMs: Int?,
    val createdAt: OffsetDateTime?,
)

data class TeamSpendResponse(
    val teamId: UUID,
    val monthlyBudgetUsd: BigDecimal?,
    val spendUsd: BigDecimal,
    val periodStart: OffsetDateTime,
)

data class UpdateTeamBudgetRequest(val monthlyBudgetUsd: BigDecimal?)

data class HeartbeatStatusResponse(
    val enabled: Boolean,
    val intervalMs: Long,
    val lastTickAt: OffsetDateTime?,
    val lastRunTaskId: UUID?,
    val lastError: String?,
)
