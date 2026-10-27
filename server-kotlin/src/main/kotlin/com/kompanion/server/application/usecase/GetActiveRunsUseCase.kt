package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.GetActiveRuns
import com.kompanion.server.application.port.inbound.GetActiveRunsQuery
import com.kompanion.server.application.port.outbound.ProjectStore
import com.kompanion.server.application.port.outbound.RunStore
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.ActiveRun
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

// Same existence check as GetProjectSpendUseCase: an empty list is a normal
// answer here, so a typo'd project id must not pass for an idle project.
@Service
class GetActiveRunsUseCase(
    private val projects: ProjectStore,
    private val runs: RunStore,
) : GetActiveRuns {

    @Transactional(readOnly = true)
    override fun handle(query: GetActiveRunsQuery): List<ActiveRun> {
        if (!projects.exists(query.projectId)) {
            throw DomainException.NotFound("project not found")
        }
        return runs.activeRuns(query.projectId)
    }
}
