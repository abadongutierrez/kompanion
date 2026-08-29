package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.Task
import java.util.UUID

// What the application needs of task persistence, in the domain's own
// vocabulary. Implemented by adapter/outbound/persistence/JdbcTaskStore.
interface TaskStore {

    fun findById(id: UUID): Task?

    fun save(task: Task): Task

    // The repositories linked to a task. Kept on this port rather than
    // hidden inside a fatter "task with everything" read, because it is a
    // link table the wire contract exposes and nothing in the domain models.
    fun repositoryIdsFor(taskId: UUID): List<UUID>
}
