package com.kompanion.server.application.port.inbound

// Called once at boot. A run lives inside the server process, so any run
// the database still shows as in flight was cut off by a crash or a kill.
// Returns how many runs were closed.
interface ReconcileAbandonedRuns {
    fun handle(): Int
}
