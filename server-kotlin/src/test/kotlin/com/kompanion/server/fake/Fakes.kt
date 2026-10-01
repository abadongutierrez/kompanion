package com.kompanion.server.fake

import com.kompanion.server.application.port.outbound.AgentInstances
import com.kompanion.server.application.port.outbound.AgentStore
import com.kompanion.server.application.port.outbound.BuildInstanceRequest
import com.kompanion.server.application.port.outbound.BuiltInstance
import com.kompanion.server.application.port.outbound.RunInstances
import com.kompanion.server.application.port.outbound.Harnesses
import com.kompanion.server.application.port.outbound.ProjectStore
import com.kompanion.server.application.port.outbound.SkillFiles
import com.kompanion.server.application.port.outbound.SkillInspection
import com.kompanion.server.application.port.outbound.SkillStore
import com.kompanion.server.application.port.outbound.SpendStore
import com.kompanion.server.application.port.outbound.TaskStore
import com.kompanion.server.domain.model.Agent
import com.kompanion.server.domain.model.AgentInstance
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.DaySpend
import com.kompanion.server.domain.model.ProjectSpend
import com.kompanion.server.domain.model.Skill
import com.kompanion.server.domain.model.Task
import java.math.BigDecimal
import java.time.OffsetDateTime
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

    override fun normalizePath(path: String): String = path.removePrefix("/library/")

    override fun validate(runtime: AgentRuntime, path: String): String? {
        validated += runtime to path
        return problem
    }
}

// Seeded with whatever the test wants the rollup to say. The query itself is
// the adapter's problem; what the use case owes is the existence check and
// the assembly of the two halves.
class InMemorySpendStore(
    private val spend: ProjectSpend? = null,
    private val byDay: List<DaySpend> = emptyList(),
) : SpendStore {
    val asked = mutableListOf<UUID>()

    override fun projectSpend(projectId: UUID): ProjectSpend {
        asked += projectId
        return spend ?: ProjectSpend(projectId, BigDecimal.ZERO, 0, BigDecimal.ZERO, OffsetDateTime.now())
    }

    override fun projectDailySpend(projectId: UUID): List<DaySpend> = byDay
}

class InMemoryProjectStore(vararg seed: UUID) : ProjectStore {
    private val ids = seed.toSet()

    override fun exists(id: UUID): Boolean = ids.contains(id)
}

class InMemorySkillStore(vararg seed: Skill) : SkillStore {
    private val skills = seed.associateBy { it.id!! }.toMutableMap()
    val assignments = mutableMapOf<UUID, List<UUID>>()
    val deleted = mutableListOf<UUID>()

    // What agentTitlesUsing answers, set by the test that needs it. The fake
    // does not join against agents; it only has to say who "uses" a skill.
    val titlesBySkill = mutableMapOf<UUID, List<String>>()

    override fun findById(id: UUID): Skill? = skills[id]

    override fun findBySlug(slug: String): Skill? = skills.values.firstOrNull { it.slug == slug }

    override fun findAll(): List<Skill> = skills.values.sortedBy { it.slug }

    override fun findAllById(ids: Collection<UUID>): List<Skill> = ids.mapNotNull { skills[it] }

    override fun save(skill: Skill): Skill {
        // Stands in for the database generating one on insert.
        val stored = if (skill.id == null) skill.copy(id = UUID.randomUUID()) else skill
        skills[stored.id!!] = stored
        return stored
    }

    override fun delete(id: UUID) {
        deleted += id
        skills.remove(id)
    }

    override fun agentTitlesUsing(skillId: UUID): List<String> = titlesBySkill[skillId].orEmpty()

    override fun skillsFor(agentId: UUID): List<Skill> =
        assignments[agentId].orEmpty().mapNotNull { skills[it] }.sortedBy { it.slug }

    override fun replaceAssignments(agentId: UUID, skillIds: Collection<UUID>) {
        assignments[agentId] = skillIds.toList()
    }
}

// Answers every build with the same instance and remembers what it was asked.
class FakeAgentInstances(
    private val answer: AgentInstance = AgentInstance("hash-1", emptyList(), null, null),
    private val path: String = "/store/hash-1",
) : AgentInstances {
    val requests = mutableListOf<BuildInstanceRequest>()

    override fun build(request: BuildInstanceRequest): BuiltInstance {
        requests += request
        return BuiltInstance(answer, path)
    }
}

class InMemoryRunInstances : RunInstances {
    val recorded = mutableListOf<Pair<UUID, AgentInstance>>()

    override fun record(runId: UUID, instance: AgentInstance) {
        recorded += runId to instance
    }
}

// Paths map to what inspecting them should say. Anything not listed is "no
// folder", which is what a real missing path says too.
class FakeSkillFiles : SkillFiles {
    val folders = mutableMapOf<String, SkillInspection>()
    val libraryPaths = mutableListOf<String>()
    val bodies = mutableMapOf<String, String>()

    // (runtime, harnessPath, slug) triples the harness "already has".
    val harnessSkills = mutableSetOf<Triple<AgentRuntime, String, String>>()

    fun valid(path: String, slug: String, name: String = slug, description: String = "does $slug things") {
        folders[normalizePath(path)] = SkillInspection.Valid(slug, name, description, hash = "hash-of-$slug")
    }

    // Keyed by the normalized path, as the real adapter resolves both spellings
    // of a library path to the same folder.
    override fun inspect(path: String): SkillInspection =
        folders[normalizePath(path)] ?: SkillInspection.Problem("no folder at \"$path\"")

    override fun normalizePath(path: String): String = path.removePrefix("/library/")

    override fun libraryFolders(): List<String> = libraryPaths

    override fun readBody(path: String): String? = bodies[path]

    override fun harnessHasSkill(runtime: AgentRuntime, harnessPath: String, slug: String): Boolean =
        Triple(runtime, harnessPath, slug) in harnessSkills
}
