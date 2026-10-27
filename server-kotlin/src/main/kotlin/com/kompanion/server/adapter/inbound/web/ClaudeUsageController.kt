package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.GetClaudeUsage
import com.kompanion.server.domain.model.ClaudeUsage
import com.kompanion.server.domain.model.UsageWindow
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

// Server-wide, not under /projects: the usage window belongs to the Claude
// account the server runs as, and every project's runs draw from it.
// Always 200 — "we can't tell" is a normal answer with available=false.
@RestController
class ClaudeUsageController(private val getClaudeUsage: GetClaudeUsage) {

    @GetMapping("/api/claude/usage")
    fun usage(): ClaudeUsageResponse = getClaudeUsage.handle().toResponse()
}

data class ClaudeUsageResponse(
    val available: Boolean,
    val reason: String?,
    val windows: List<UsageWindowResponse>,
    val fetchedAt: Instant,
)

data class UsageWindowResponse(
    val kind: String,
    val utilization: Double?,
    val resetsAt: Instant?,
    val status: String?,
)

private fun ClaudeUsage.toResponse() = ClaudeUsageResponse(
    available = available,
    reason = reason,
    windows = windows.map { it.toResponse() },
    fetchedAt = fetchedAt,
)

private fun UsageWindow.toResponse() = UsageWindowResponse(kind, utilization, resetsAt, status)
