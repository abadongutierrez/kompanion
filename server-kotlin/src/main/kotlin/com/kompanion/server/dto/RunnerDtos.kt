package com.kompanion.server.dto

import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

data class BuiltinHarnessResponse(val slug: String, val title: String, val path: String)

data class TaskRunResponse(
    val id: UUID,
    val taskId: UUID,
    val agentId: UUID,
    // Denormalized for display, exactly like TaskComment's authorTitle: the
    // runs list needs a name, not an id, and an Agent can be renamed or
    // reassigned without rewriting history — the title recorded here is
    // whichever one the run was served by at the time it is read.
    val agentTitle: String?,
    // The runtime that actually produced this run, not whatever the Agent is
    // set to now — the UI picks its transcript reducer from this, and replay
    // of an old run has to keep working after an Agent switches CLI.
    val runtime: String,
    val model: String?,
    val status: String,
    val summary: String?,
    val rawOutput: Any?,
    val costUsd: BigDecimal?,
    val durationMs: Int?,
    // Cache reads and writes are separate because they bill differently
    // (0.1x and 1.25x of input), and because `inputTokens` counts only what
    // was NOT served from cache — a display showing total input must add all
    // three or it will report a 1.5M-token run as a few dozen.
    val inputTokens: Long?,
    val outputTokens: Long?,
    val cacheReadTokens: Long?,
    val cacheWriteTokens: Long?,
    val createdAt: OffsetDateTime?,
)

// One calendar day's spend. `day` is an ISO date computed in UTC, matching
// the month window in TeamSpendResponse — the JDBC pool pins sessions to UTC
// precisely so these boundaries don't drift with the server's local offset.
data class DailySpendResponse(
    val day: String,
    val spendUsd: BigDecimal,
    val runCount: Int,
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
