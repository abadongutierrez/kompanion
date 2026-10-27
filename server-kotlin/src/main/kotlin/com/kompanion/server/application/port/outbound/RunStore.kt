package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.ActiveRun
import java.util.UUID

// What the application reads about runs. Implemented by
// adapter/outbound/persistence/JdbcRunStore. Starting and finishing runs
// still lives in the legacy RunTaskService.
interface RunStore {

    // Runs in flight across every team in the project, oldest first.
    fun activeRuns(projectId: UUID): List<ActiveRun>
}
