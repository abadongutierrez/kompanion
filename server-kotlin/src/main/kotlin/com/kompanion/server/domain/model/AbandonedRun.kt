package com.kompanion.server.domain.model

import java.time.Instant
import java.util.UUID

// A run the database still shows as in flight when the server boots.
data class AbandonedRun(
    val runId: UUID,
    val taskId: UUID,
    val startedAt: Instant,
)
