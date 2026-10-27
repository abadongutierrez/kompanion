package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.RunProcess

// The OS side of a run. Implemented by adapter/outbound/process/OsRunProcesses.
fun interface RunProcesses {

    // Makes sure the process and everything it spawned are gone. True when
    // nothing of it is left: it was already gone, the pid now belongs to an
    // unrelated process, or it was killed. False when it may still be running
    // — it would not die, or it cannot be told apart from a stranger.
    fun stop(process: RunProcess): Boolean
}
