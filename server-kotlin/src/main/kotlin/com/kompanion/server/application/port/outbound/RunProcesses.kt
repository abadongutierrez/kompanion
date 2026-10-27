package com.kompanion.server.application.port.outbound

import java.util.UUID

// The OS side of a run. Implemented by adapter/outbound/process/OsRunProcesses.
fun interface RunProcesses {

    // Makes sure no process started by a run on this task is left: the CLI
    // and everything it spawned, including tools that outlived it. True when
    // none is left. False when one may still be running — it would not die,
    // or the processes cannot be inspected at all.
    fun stopAll(taskId: UUID): Boolean
}
