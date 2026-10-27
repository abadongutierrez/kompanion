package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.CreateAgentCommand
import com.kompanion.server.application.port.inbound.CreateRuntimeCommand
import com.kompanion.server.application.port.inbound.UpdateAgentCommand
import com.kompanion.server.application.port.inbound.UpdateRuntimeCommand
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import com.kompanion.server.fake.FakeHarnesses
import com.kompanion.server.fake.FakeRuntimeProbe
import com.kompanion.server.fake.InMemoryAgentStore
import com.kompanion.server.fake.InMemoryRuntimeStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.util.UUID

class RuntimeUseCasesTest {

    private val store = InMemoryRuntimeStore()

    private fun create(name: String = "Claude (work)", kind: AgentRuntime = AgentRuntime.claude_code, bin: String? = null, dir: String? = null) =
        CreateRuntimeUseCase(store).handle(CreateRuntimeCommand(name, kind, bin, dir))

    @Test
    fun `it creates a runtime, trimming and clearing blanks`() {
        val created = create(name = "  Claude (work) ", bin = "  ", dir = "~/.claude-work")

        assertEquals("Claude (work)", created.name)
        assertNull(created.binaryPath)
        assertEquals("~/.claude-work", created.configDir)
    }

    @Test
    fun `names are unique ignoring case`() {
        create(name = "Claude")
        assertThrows<DomainException.Conflict> { create(name = "claude") }
    }

    @Test
    fun `a config dir is only for claude code and must be absolute`() {
        assertThrows<DomainException.Invalid> { create(kind = AgentRuntime.pi, dir = "/x") }
        assertThrows<DomainException.Invalid> { create(dir = "relative/dir") }
    }

    @Test
    fun `update changes only what is given, and blank clears`() {
        val created = create(bin = "/usr/bin/claude", dir = "/home/me/.claude-a")
        val useCase = UpdateRuntimeUseCase(store)

        val renamed = useCase.handle(UpdateRuntimeCommand(created.id!!, name = "Claude (a)"))
        assertEquals("/usr/bin/claude", renamed.binaryPath)

        val cleared = useCase.handle(UpdateRuntimeCommand(created.id!!, configDir = ""))
        assertNull(cleared.configDir)
        assertEquals("Claude (a)", cleared.name)
    }

    @Test
    fun `delete is refused while an agent uses the runtime`() {
        val created = create()
        store.usedBy[created.id!!] = listOf("Eng")

        val e = assertThrows<DomainException.Conflict> { DeleteRuntimeUseCase(store).handle(created.id!!) }
        assertTrue(e.message!!.contains("Eng"))

        store.usedBy.clear()
        DeleteRuntimeUseCase(store).handle(created.id!!)
        assertNull(store.findById(created.id!!))
    }

    @Test
    fun `test hands the runtime to the probe`() {
        val created = create()
        val probe = FakeRuntimeProbe()

        val result = TestRuntimeUseCase(store, probe).handle(created.id!!)

        assertTrue(result.ok)
        assertEquals(listOf(created), probe.probed)
    }

    @Test
    fun `an agent created on a runtime takes its kind`() {
        val opencode = create(name = "oc", kind = AgentRuntime.opencode)
        val agents = InMemoryAgentStore()

        val agent = CreateAgentUseCase(agents, FakeHarnesses(), store).handle(
            CreateAgentCommand("Eng", "h", runtime = null, model = null, runtimeId = opencode.id),
        )

        assertEquals(AgentRuntime.opencode, agent.runtime)
        assertEquals(opencode.id, agent.runtimeId)
    }

    @Test
    fun `a runtime of another kind than the one named is rejected`() {
        val opencode = create(name = "oc", kind = AgentRuntime.opencode)

        assertThrows<DomainException.Invalid> {
            CreateAgentUseCase(InMemoryAgentStore(), FakeHarnesses(), store).handle(
                CreateAgentCommand("Eng", "h", runtime = AgentRuntime.pi, model = null, runtimeId = opencode.id),
            )
        }
    }

    @Test
    fun `update can move an agent to a runtime and clear it again`() {
        val claude = create()
        val agentId = UUID.randomUUID()
        val agents = InMemoryAgentStore(Agent(id = agentId, title = "Eng", slug = "eng", harnessPath = "h"))
        val useCase = UpdateAgentUseCase(agents, FakeHarnesses(), store)

        assertEquals(claude.id, useCase.handle(UpdateAgentCommand(agentId, runtimeId = claude.id)).runtimeId)
        assertNull(useCase.handle(UpdateAgentCommand(agentId, clearRuntimeId = true)).runtimeId)
    }

    @Test
    fun `switching an agent's kind by hand drops its runtime`() {
        val claude = create()
        val agentId = UUID.randomUUID()
        val agents = InMemoryAgentStore(
            Agent(id = agentId, title = "Eng", slug = "eng", harnessPath = "h", runtimeId = claude.id),
        )

        val updated = UpdateAgentUseCase(agents, FakeHarnesses(), store)
            .handle(UpdateAgentCommand(agentId, runtime = AgentRuntime.pi))

        assertNull(updated.runtimeId)
    }

    @Test
    fun `resolved config dir expands a leading tilde`() {
        assertEquals("/h/.c", Runtime(name = "x", kind = AgentRuntime.claude_code, configDir = "~/.c").resolvedConfigDir("/h"))
        assertEquals("/abs", Runtime(name = "x", kind = AgentRuntime.claude_code, configDir = "/abs").resolvedConfigDir("/h"))
        assertNull(Runtime(name = "x", kind = AgentRuntime.claude_code).resolvedConfigDir("/h"))
    }
}
