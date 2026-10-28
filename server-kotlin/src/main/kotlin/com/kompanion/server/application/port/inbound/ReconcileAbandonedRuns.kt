package com.kompanion.server.application.port.inbound

import java.util.UUID

// Called once at boot. A run lives inside the server process, so any run
// the database still shows as in flight was cut off by a crash or a kill.
interface ReconcileAbandonedRuns {
    fun handle(): ReconcileResult
}

// closed: failed and their tasks freed. stillRunning: their CLI may still be
// at work, so they keep their task until someone stops it by hand.
// unchecked: tasks whose processes could not even be looked for, and why;
// their runs count as stillRunning.
data class ReconcileResult(
    val closed: Int,
    val stillRunning: Int,
    val unchecked: Map<UUID, String> = emptyMap(),
)
