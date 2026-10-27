package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.Runtime

// Asks the CLI itself whether it can be started the way a run would start it.
interface RuntimeProbe {
    fun probe(runtime: Runtime): ProbeResult
}

// ok with the CLI's own version line, or not ok with what went wrong.
data class ProbeResult(val ok: Boolean, val message: String)
