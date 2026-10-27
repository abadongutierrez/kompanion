package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.CreateRuntime
import com.kompanion.server.application.port.inbound.CreateRuntimeCommand
import com.kompanion.server.application.port.inbound.DeleteRuntime
import com.kompanion.server.application.port.inbound.ListRuntimes
import com.kompanion.server.application.port.inbound.TestRuntime
import com.kompanion.server.application.port.inbound.UpdateRuntime
import com.kompanion.server.application.port.inbound.UpdateRuntimeCommand
import com.kompanion.server.application.port.outbound.ProbeResult
import com.kompanion.server.application.port.outbound.RuntimeProbe
import com.kompanion.server.application.port.outbound.RuntimeStore
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private fun String?.blankToNull(): String? = this?.trim()?.ifEmpty { null }

private fun requireName(runtimes: RuntimeStore, name: String, excludeId: UUID? = null): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) throw DomainException.Invalid("name is required")
    val clash = runtimes.findByName(trimmed)
    if (clash != null && clash.id != excludeId) {
        throw DomainException.Conflict("a runtime named \"${clash.name}\" already exists")
    }
    return trimmed
}

// Only claude_code reads a config dir. Rejecting it elsewhere beats storing a
// value that silently does nothing.
private fun checkConfigDir(kind: AgentRuntime, configDir: String?) {
    if (configDir == null) return
    if (kind != AgentRuntime.claude_code) {
        throw DomainException.Invalid("a config directory is only supported for claude_code runtimes")
    }
    if (!configDir.startsWith("/") && configDir != "~" && !configDir.startsWith("~/")) {
        throw DomainException.Invalid("config directory must be an absolute path (or start with ~/)")
    }
}

@Service
class ListRuntimesUseCase(private val runtimes: RuntimeStore) : ListRuntimes {
    override fun handle(): List<Runtime> = runtimes.findAll()
}

@Service
class CreateRuntimeUseCase(private val runtimes: RuntimeStore) : CreateRuntime {

    @Transactional
    override fun handle(command: CreateRuntimeCommand): Runtime {
        val name = requireName(runtimes, command.name)
        val configDir = command.configDir.blankToNull()
        checkConfigDir(command.kind, configDir)
        return runtimes.save(
            Runtime(
                name = name,
                kind = command.kind,
                binaryPath = command.binaryPath.blankToNull(),
                configDir = configDir,
            ),
        )
    }
}

@Service
class UpdateRuntimeUseCase(private val runtimes: RuntimeStore) : UpdateRuntime {

    @Transactional
    override fun handle(command: UpdateRuntimeCommand): Runtime {
        val existing = runtimes.findById(command.runtimeId)
            ?: throw DomainException.NotFound("runtime not found")
        val configDir = if (command.configDir == null) existing.configDir else command.configDir.blankToNull()
        checkConfigDir(existing.kind, configDir)
        return runtimes.save(
            existing.copy(
                name = command.name?.let { requireName(runtimes, it, existing.id) } ?: existing.name,
                binaryPath = if (command.binaryPath == null) existing.binaryPath else command.binaryPath.blankToNull(),
                configDir = configDir,
            ),
        )
    }
}

@Service
class DeleteRuntimeUseCase(private val runtimes: RuntimeStore) : DeleteRuntime {

    @Transactional
    override fun handle(runtimeId: UUID) {
        val existing = runtimes.findById(runtimeId) ?: throw DomainException.NotFound("runtime not found")
        val users = runtimes.agentTitlesUsing(runtimeId)
        if (users.isNotEmpty()) {
            throw DomainException.Conflict(
                "runtime \"${existing.name}\" is used by ${users.joinToString(", ")} — move those Agents first",
            )
        }
        runtimes.delete(runtimeId)
    }
}

@Service
class TestRuntimeUseCase(
    private val runtimes: RuntimeStore,
    private val probe: RuntimeProbe,
) : TestRuntime {
    override fun handle(runtimeId: UUID): ProbeResult {
        val runtime = runtimes.findById(runtimeId) ?: throw DomainException.NotFound("runtime not found")
        return probe.probe(runtime)
    }
}
