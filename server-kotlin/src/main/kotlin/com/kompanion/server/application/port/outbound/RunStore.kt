package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.ActiveRun
import java.util.UUID

// What the application reads about runs. Implemented by
// adapter/outbound/persistence/JdbcRunStore. Starting and finishing runs
// still lives in the legacy RunTaskService.
interface RunStore {

    // Runs in flight across every team in the project, oldest first.
    fun activeRuns(projectId: UUID): List<ActiveRun>

    // Marks every run still at 'running' as failed with this summary, and
    // frees every task still claimed by running_since. Returns how many
    // runs it failed.
    fun failAbandonedRuns(summary: String): Int
}
