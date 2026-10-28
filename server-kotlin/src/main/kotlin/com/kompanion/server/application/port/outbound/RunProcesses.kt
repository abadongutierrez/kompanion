package com.kompanion.server.application.port.outbound

import java.time.Instant
import java.util.UUID

// The OS side of a run. Implemented by adapter/outbound/process/OsRunProcesses.
fun interface RunProcesses {

    // Makes sure no process started by a run on this task is left: the CLI
    // and everything it spawned, including tools that outlived it. `since` is
    // when the earliest such run began; nothing older can be one of its
    // processes. `folders` are where the runs worked: a process inside one
    // may be the run's even with no trace of it in its environment. True when
    // none is left. False when one may still be running — it would not die,
    // or it could not be inspected, or it cannot be told apart from the run's.
    fun stopAll(taskId: UUID, since: Instant, folders: List<String>): Boolean
}
