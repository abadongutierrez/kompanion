package com.kompanion.server.domain.model

import java.time.Instant
import java.util.UUID

// A run the database still shows as in flight when the server boots. Its
// process is null when none was recorded: the CLI never started, or the run
// predates V29.
data class AbandonedRun(
    val runId: UUID,
    val taskId: UUID,
    val process: RunProcess?,
)

// The agent CLI's OS process. startedAt is null if the OS did not report it.
data class RunProcess(
    val pid: Long,
    val startedAt: Instant?,
)
