package com.kompanion.server.application.port.inbound

// Called once at boot. A run lives inside the server process, so any run
// the database still shows as in flight was cut off by a crash or a kill.
interface ReconcileAbandonedRuns {
    fun handle(): ReconcileResult
}

// closed: failed and their tasks freed. stillRunning: their CLI may still be
// at work, so they keep their task until someone stops it by hand.
data class ReconcileResult(val closed: Int, val stillRunning: Int)
