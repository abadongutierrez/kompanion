package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.ActiveRun
import java.util.UUID

// The runs going on in a project right now, for the Runs tab.
interface GetActiveRuns {
    fun handle(query: GetActiveRunsQuery): List<ActiveRun>
}

data class GetActiveRunsQuery(val projectId: UUID)
