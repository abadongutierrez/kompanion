package com.kompanion.server.fake

import com.kompanion.server.application.port.outbound.AgentStore
import com.kompanion.server.application.port.outbound.Harnesses
import com.kompanion.server.application.port.outbound.TaskStore
import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Task
import java.util.UUID

// Fakes, not mocks, per ARCHITECTURE.md: a map-backed store reads better
// than a stack of stubbing calls, and it fails loudly when a port's contract
// changes instead of quietly returning null.

class InMemoryTaskStore(vararg seed: Task) : TaskStore {
    val saved = mutableListOf<Task>()
    private val tasks = seed.associateBy { it.id!! }.toMutableMap()
    var repositoryIds: List<UUID> = emptyList()

    override fun findById(id: UUID): Task? = tasks[id]

    override fun save(task: Task): Task {
        saved += task
        tasks[task.id!!] = task
        return task
    }

    override fun repositoryIdsFor(taskId: UUID): List<UUID> = repositoryIds
}

class InMemoryAgentStore(vararg seed: Agent) : AgentStore {
    val saved = mutableListOf<Agent>()
    private val agents = seed.associateBy { it.id!! }.toMutableMap()

    override fun findById(id: UUID): Agent? = agents[id]

    override fun findBySlug(slug: String): Agent? = agents.values.firstOrNull { it.slug == slug }

    override fun findBySlugExcluding(slug: String, excludeAgentId: UUID): Agent? =
        agents.values.firstOrNull { it.slug == slug && it.id != excludeAgentId }

    override fun save(agent: Agent): Agent {
        // Stands in for the database generating one on insert.
        val stored = if (agent.id == null) agent.copy(id = UUID.randomUUID()) else agent
        saved += stored
        agents[stored.id!!] = stored
        return stored
    }
}

// `problem` is what validate() returns for every path — null means "every
// harness is fine", which is what most tests want.
class FakeHarnesses(var problem: String? = null) : Harnesses {
    val validated = mutableListOf<Pair<AgentRuntime, String>>()

    override fun normalizePath(path: String): String = path.removePrefix("/workspace/")

    override fun validate(runtime: AgentRuntime, path: String): String? {
        validated += runtime to path
        return problem
    }
}
