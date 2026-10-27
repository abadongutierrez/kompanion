package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.CreateRuntime
import com.kompanion.server.application.port.inbound.CreateRuntimeCommand
import com.kompanion.server.application.port.inbound.DeleteRuntime
import com.kompanion.server.application.port.inbound.ListRuntimes
import com.kompanion.server.application.port.inbound.TestRuntime
import com.kompanion.server.application.port.inbound.UpdateRuntime
import com.kompanion.server.application.port.inbound.UpdateRuntimeCommand
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

// The runtimes behind the Settings page.
@RestController
@RequestMapping("/api/runtimes")
class RuntimeController(
    private val listRuntimes: ListRuntimes,
    private val createRuntime: CreateRuntime,
    private val updateRuntime: UpdateRuntime,
    private val deleteRuntime: DeleteRuntime,
    private val testRuntime: TestRuntime,
) {

    @GetMapping
    fun list(): List<RuntimeResponse> = listRuntimes.handle().map { it.toResponse() }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody body: CreateRuntimeRequest): RuntimeResponse =
        createRuntime.handle(
            CreateRuntimeCommand(
                name = body.name,
                kind = parseKind(body.kind),
                binaryPath = body.binaryPath,
                configDir = body.configDir,
            ),
        ).toResponse()

    @PatchMapping("/{runtimeId}")
    fun update(@PathVariable runtimeId: UUID, @RequestBody body: UpdateRuntimeRequest): RuntimeResponse =
        updateRuntime.handle(
            UpdateRuntimeCommand(runtimeId, body.name, body.binaryPath, body.configDir),
        ).toResponse()

    @DeleteMapping("/{runtimeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable runtimeId: UUID) = deleteRuntime.handle(runtimeId)

    @PostMapping("/{runtimeId}/test")
    fun test(@PathVariable runtimeId: UUID): TestRuntimeResponse =
        testRuntime.handle(runtimeId).let { TestRuntimeResponse(it.ok, it.message) }

    private fun parseKind(raw: String): AgentRuntime =
        runCatching { AgentRuntime.valueOf(raw) }.getOrElse {
            throw DomainException.Invalid(
                "unknown kind \"$raw\" — expected one of ${AgentRuntime.entries.joinToString(", ") { it.name }}",
            )
        }
}

data class CreateRuntimeRequest(
    val name: String,
    val kind: String,
    val binaryPath: String? = null,
    val configDir: String? = null,
)

// Blank binaryPath / configDir clears it; null leaves it alone.
data class UpdateRuntimeRequest(
    val name: String? = null,
    val binaryPath: String? = null,
    val configDir: String? = null,
)

data class RuntimeResponse(
    val id: UUID,
    val name: String,
    val kind: AgentRuntime,
    val binaryPath: String?,
    val configDir: String?,
    val createdAt: OffsetDateTime?,
)

data class TestRuntimeResponse(val ok: Boolean, val message: String)

private fun Runtime.toResponse() = RuntimeResponse(id!!, name, kind, binaryPath, configDir, createdAt)
