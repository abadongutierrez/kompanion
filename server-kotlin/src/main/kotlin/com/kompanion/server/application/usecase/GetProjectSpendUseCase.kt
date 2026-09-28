package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.GetProjectSpend
import com.kompanion.server.application.port.inbound.GetProjectSpendQuery
import com.kompanion.server.application.port.inbound.ProjectSpendView
import com.kompanion.server.application.port.outbound.ProjectStore
import com.kompanion.server.application.port.outbound.SpendStore
import com.kompanion.server.domain.error.DomainException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

// The existence check is not ceremony: a spend rollup over no rows is a
// perfectly cheerful $0.00, so without it a typo'd project id reads as a
// project that has never cost anything.
@Service
class GetProjectSpendUseCase(
    private val projects: ProjectStore,
    private val spend: SpendStore,
) : GetProjectSpend {

    @Transactional(readOnly = true)
    override fun handle(query: GetProjectSpendQuery): ProjectSpendView {
        if (!projects.exists(query.projectId)) {
            throw DomainException.NotFound("project not found")
        }

        return ProjectSpendView(
            spend = spend.projectSpend(query.projectId),
            byDay = spend.projectDailySpend(query.projectId),
        )
    }
}
