package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.AbandonedRun
import com.kompanion.server.domain.model.ActiveRun
import java.util.UUID

// What the application reads about runs. Implemented by
// adapter/outbound/persistence/JdbcRunStore. Starting and finishing runs
// still lives in the legacy RunTaskService.
interface RunStore {

    // Runs in flight across every team in the project, oldest first.
    fun activeRuns(projectId: UUID): List<ActiveRun>

    // Every run still at 'running', across all projects.
    fun abandonedRuns(): List<AbandonedRun>

    // Marks these runs failed with this summary, then frees every task whose
    // claim (running_since) no run at 'running' backs any more — including
    // claims whose run row was never written.
    fun failAbandonedRuns(runIds: List<UUID>, summary: String)
}
