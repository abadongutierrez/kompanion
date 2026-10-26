package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.ClaudeUsage
import com.kompanion.server.domain.model.UsageWindow

// What the sidebar asks: how much of the Claude usage windows is left.
interface GetClaudeUsage {
    fun handle(): ClaudeUsage
}

// What a Claude Code run reports as it goes: the latest rate_limit_event,
// already turned into a window. Lets the readout move during a run without
// another call to the usage endpoint.
fun interface RecordClaudeRateLimit {
    fun handle(window: UsageWindow)
}
