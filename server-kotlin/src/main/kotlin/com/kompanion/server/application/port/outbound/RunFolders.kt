package com.kompanion.server.application.port.outbound

import java.util.UUID

// Where a task's runs work: its task workspace and every worktree its runs
// were given. Implemented by adapter/outbound/workspace/DiskRunFolders.
fun interface RunFolders {

    fun of(taskId: UUID): List<String>
}
