package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.CreateAgentCommand
import com.kompanion.server.application.port.inbound.UpdateAgentCommand
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.fake.FakeHarnesses
import com.kompanion.server.fake.InMemoryAgentStore
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertThrows
import java.util.UUID

class CreateAgentUseCaseTest {

    private fun useCase(agents: InMemoryAgentStore, harnesses: FakeHarnesses) =
        CreateAgentUseCase(agents, harnesses)

    @Test
    fun `it derives a slug, normalizes the path, and defaults the runtime`() {
        val agents = InMemoryAgentStore()

        val created = useCase(agents, FakeHarnesses()).handle(
            CreateAgentCommand(
                title = "Staff Engineer!",
                harnessPath = "/workspace/harnesses/engineer",
                runtime = null,
                model = null,
            ),
        )

        assertEquals("staff-engineer", created.slug)
        assertEquals("harnesses/engineer", created.harnessPath)
        assertEquals(AgentRuntime.claude_code, created.runtime)
        assertNull(created.model)
    }

    @Test
    fun `a taken slug is suffixed rather than refused`() {
        // The operator asked for a title, not a slug — there is nothing for
        // them to fix, so this must not be an error.
        val agents = InMemoryAgentStore(
            Agent(id = UUID.randomUUID(), title = "Engineer", slug = "engineer", harnessPath = "h"),
        )

        val created = useCase(agents, FakeHarnesses()).handle(
            CreateAgentCommand("Engineer", "h", null, null),
        )

        assertEquals("engineer-2", created.slug)
    }

    @Test
    fun `an unusable harness is refused with the reason, and nothing is saved`() {
        val agents = InMemoryAgentStore()
        val harnesses = FakeHarnesses(problem = "no .claude/ config")

        val e = assertThrows<DomainException.Invalid> {
            useCase(agents, harnesses).handle(CreateAgentCommand("Engineer", "h", AgentRuntime.claude_code, null))
        }

        assertEquals("no .claude/ config", e.message)
        assertTrue(agents.saved.isEmpty())
    }

    @Test
    fun `a blank model means the CLI default`() {
        val agents = InMemoryAgentStore()

        val created = useCase(agents, FakeHarnesses()).handle(
            CreateAgentCommand("Engineer", "h", AgentRuntime.opencode, "   "),
        )

        assertNull(created.model)
    }
}

class UpdateAgentUseCaseTest {

    private val agentId = UUID.randomUUID()

    private fun existing() = Agent(
        id = agentId,
        title = "Engineer",
        slug = "engineer",
        harnessPath = "harnesses/engineer",
        runtime = AgentRuntime.claude_code,
        model = "claude-opus-5",
    )

    @Test
    fun `absent fields are left alone`() {
        val agents = InMemoryAgentStore(existing())

        val updated = UpdateAgentUseCase(agents, FakeHarnesses())
            .handle(UpdateAgentCommand(agentId = agentId, title = "Senior Engineer"))

        assertEquals("Senior Engineer", updated.title)
        assertEquals("engineer", updated.slug)
        assertEquals("harnesses/engineer", updated.harnessPath)
        assertEquals("claude-opus-5", updated.model)
    }

    @Test
    fun `switching runtime re-validates the harness that is already stored`() {
        // A .claude/-only harness stops being valid the moment the agent
        // switches to opencode, even though the path did not change.
        val agents = InMemoryAgentStore(existing())
        val harnesses = FakeHarnesses()

        UpdateAgentUseCase(agents, harnesses)
            .handle(UpdateAgentCommand(agentId = agentId, runtime = AgentRuntime.opencode))

        assertEquals(listOf(AgentRuntime.opencode to "harnesses/engineer"), harnesses.validated)
    }

    @Test
    fun `an edit that touches neither path nor runtime does not hit the filesystem`() {
        val agents = InMemoryAgentStore(existing())
        val harnesses = FakeHarnesses()

        UpdateAgentUseCase(agents, harnesses).handle(UpdateAgentCommand(agentId = agentId, title = "X"))

        assertTrue(harnesses.validated.isEmpty())
    }

    @Test
    fun `taking another agent's slug is a conflict`() {
        val agents = InMemoryAgentStore(
            existing(),
            Agent(id = UUID.randomUUID(), title = "QA", slug = "qa", harnessPath = "h"),
        )

        val e = assertThrows<DomainException.Conflict> {
            UpdateAgentUseCase(agents, FakeHarnesses())
                .handle(UpdateAgentCommand(agentId = agentId, slug = "qa"))
        }

        assertEquals("slug \"qa\" is already used by another agent", e.message)
    }

    @Test
    fun `a blank model clears it back to the CLI default`() {
        val agents = InMemoryAgentStore(existing())

        val updated = UpdateAgentUseCase(agents, FakeHarnesses())
            .handle(UpdateAgentCommand(agentId = agentId, model = ""))

        assertNull(updated.model)
    }

    @Test
    fun `an unknown agent is not found`() {
        assertThrows<DomainException.NotFound> {
            UpdateAgentUseCase(InMemoryAgentStore(), FakeHarnesses())
                .handle(UpdateAgentCommand(agentId = agentId, title = "X"))
        }
    }
}
