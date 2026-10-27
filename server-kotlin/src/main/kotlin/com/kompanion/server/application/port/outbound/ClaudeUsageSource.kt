package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.UsageWindow

// Where the current usage windows are read from on demand. Implemented by
// adapter/outbound/claude/OAuthClaudeUsageSource, which calls the CLI's own
// (undocumented) usage endpoint. Never throws: every failure is a reason.
fun interface ClaudeUsageSource {
    fun read(): UsageReading
}

sealed interface UsageReading {
    data class Windows(val windows: List<UsageWindow>) : UsageReading
    data class Unavailable(val reason: String) : UsageReading
}
