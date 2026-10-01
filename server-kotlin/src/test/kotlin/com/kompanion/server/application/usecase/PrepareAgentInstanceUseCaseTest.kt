package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.PrepareAgentInstanceCommand
import com.kompanion.server.domain.model.AgentInstance
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.LoadedSkill
import com.kompanion.server.domain.model.Skill
import com.kompanion.server.domain.model.SkillOutcome
import com.kompanion.server.fake.FakeAgentInstances
import com.kompanion.server.fake.InMemoryRunInstances
import com.kompanion.server.fake.InMemorySkillStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class PrepareAgentInstanceUseCaseTest {

    private val agentId = UUID.randomUUID()
    private val runId = UUID.randomUUID()

    private fun skill(slug: String) =
        Skill(id = UUID.randomUUID(), slug = slug, name = slug, description = "d", skillPath = "skills/$slug")

    @Test
    fun `it builds from the agent's runtime, harness and skills, and records the result on the run`() {
        val handoff = skill("handoff")
        val store = InMemorySkillStore(handoff, skill("not-assigned")).apply { replaceAssignments(agentId, listOf(handoff.id!!)) }
        val instance = AgentInstance("abc", listOf(LoadedSkill("handoff", "h1", SkillOutcome.loaded)), "sha1", false)
        val instances = FakeAgentInstances(instance, path = "/store/abc")
        val runs = InMemoryRunInstances()

        val prepared = PrepareAgentInstanceUseCase(store, instances, runs).handle(
            PrepareAgentInstanceCommand(agentId, AgentRuntime.pi, "harnesses/engineer", runId),
        )

        val request = instances.requests.single()
        assertEquals(AgentRuntime.pi, request.runtime)
        assertEquals("harnesses/engineer", request.harnessPath)
        assertEquals(listOf("handoff"), request.skills.map { it.slug })

        assertEquals(listOf(runId to instance), runs.recorded)
        assertEquals("/store/abc", prepared.path)
        assertEquals(instance, prepared.instance)
    }

    @Test
    fun `an agent with no skills still gets an instance and a record`() {
        val instances = FakeAgentInstances()
        val runs = InMemoryRunInstances()

        PrepareAgentInstanceUseCase(InMemorySkillStore(), instances, runs).handle(
            PrepareAgentInstanceCommand(agentId, AgentRuntime.claude_code, "h", runId),
        )

        assertEquals(emptyList<Skill>(), instances.requests.single().skills)
        assertEquals(1, runs.recorded.size)
    }
}
