package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.GetActiveRuns
import com.kompanion.server.application.port.inbound.GetActiveRunsQuery
import com.kompanion.server.domain.model.ActiveRun
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

// The project's Runs tab: what is running right now, across every team.
// Basic facts only; the live transcript stays on the task page, which each
// row links to.
@RestController
@RequestMapping("/api/projects/{projectId}/runs")
class ProjectRunsController(private val getActiveRuns: GetActiveRuns) {

    @GetMapping("/active")
    fun active(@PathVariable projectId: UUID): List<ActiveRunResponse> =
        getActiveRuns.handle(GetActiveRunsQuery(projectId)).map { it.toResponse() }
}

data class ActiveRunResponse(
    val runId: UUID,
    val taskId: UUID,
    val taskTitle: String,
    val teamId: UUID,
    val teamName: String,
    val agentTitle: String?,
    val runtime: String,
    val model: String?,
    val startedAt: OffsetDateTime,
)

private fun ActiveRun.toResponse() = ActiveRunResponse(
    runId = runId,
    taskId = taskId,
    taskTitle = taskTitle,
    teamId = teamId,
    teamName = teamName,
    agentTitle = agentTitle,
    runtime = runtime,
    model = model,
    startedAt = startedAt,
)
