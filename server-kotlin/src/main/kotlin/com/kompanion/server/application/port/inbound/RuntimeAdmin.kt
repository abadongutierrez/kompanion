package com.kompanion.server.application.port.inbound

import com.kompanion.server.application.port.outbound.ProbeResult
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import java.util.UUID

interface ListRuntimes {
    fun handle(): List<Runtime>
}

interface CreateRuntime {
    fun handle(command: CreateRuntimeCommand): Runtime
}

data class CreateRuntimeCommand(
    val name: String,
    val kind: AgentRuntime,
    val binaryPath: String?,
    val configDir: String?,
)

// Absent leaves the current value alone; for binaryPath and configDir a blank
// string clears it. The kind cannot change: Agents on it were validated
// against that kind's harness layout.
interface UpdateRuntime {
    fun handle(command: UpdateRuntimeCommand): Runtime
}

data class UpdateRuntimeCommand(
    val runtimeId: UUID,
    val name: String? = null,
    val binaryPath: String? = null,
    val configDir: String? = null,
)

// Refused while any Agent runs on it.
interface DeleteRuntime {
    fun handle(runtimeId: UUID)
}

interface TestRuntime {
    fun handle(runtimeId: UUID): ProbeResult
}
