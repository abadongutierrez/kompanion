package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.AgentSkillView
import com.kompanion.server.application.port.inbound.AssignSkills
import com.kompanion.server.application.port.inbound.AssignSkillsCommand
import com.kompanion.server.application.port.inbound.GetSkill
import com.kompanion.server.application.port.inbound.ListAgentSkills
import com.kompanion.server.application.port.inbound.ListSkills
import com.kompanion.server.application.port.inbound.RegisterSkill
import com.kompanion.server.application.port.inbound.RegisterSkillCommand
import com.kompanion.server.application.port.inbound.ScanResult
import com.kompanion.server.application.port.inbound.ScanSkills
import com.kompanion.server.application.port.inbound.SkillDetail
import com.kompanion.server.application.port.inbound.SkillView
import com.kompanion.server.application.port.inbound.UnregisterSkill
import com.kompanion.server.application.port.outbound.AgentStore
import com.kompanion.server.application.port.outbound.SkillFiles
import com.kompanion.server.application.port.outbound.SkillInspection
import com.kompanion.server.application.port.outbound.SkillStore
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Skill
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

// A row plus whether its folder is still usable. Reading the disk on every
// list is cheap (a handful of small folders) and is what keeps "broken" honest.
internal fun SkillFiles.view(skill: Skill): SkillView = when (val found = inspect(skill.skillPath)) {
    is SkillInspection.Valid -> SkillView(skill, null)
    is SkillInspection.Problem -> SkillView(skill, found.message)
}

@Service
class RegisterSkillUseCase(
    private val skills: SkillStore,
    private val files: SkillFiles,
) : RegisterSkill {

    @Transactional
    override fun handle(command: RegisterSkillCommand): SkillView {
        val found = when (val inspected = files.inspect(command.path)) {
            is SkillInspection.Valid -> inspected
            is SkillInspection.Problem -> throw DomainException.Invalid(inspected.message)
        }
        val path = files.normalizePath(command.path)

        val existing = skills.findBySlug(found.slug)
        if (existing != null) {
            // Registering the same folder again is a refresh, not an error.
            if (existing.skillPath != path) {
                throw DomainException.Conflict(
                    "a skill with slug \"${found.slug}\" is already registered from \"${existing.skillPath}\"",
                )
            }
            return files.view(skills.save(existing.copy(name = found.name, description = found.description)))
        }

        return files.view(
            skills.save(
                Skill(slug = found.slug, name = found.name, description = found.description, skillPath = path),
            ),
        )
    }
}

@Service
class ScanSkillsUseCase(
    private val skills: SkillStore,
    private val files: SkillFiles,
) : ScanSkills {

    @Transactional
    override fun handle(): ScanResult {
        val refreshed = mutableListOf<SkillView>()
        val broken = mutableListOf<SkillView>()

        // Existing rows first: refresh the cached text, and report the ones
        // whose folder is gone or no longer valid. Never delete them.
        for (row in skills.findAll()) {
            when (val found = files.inspect(row.skillPath)) {
                is SkillInspection.Valid -> {
                    if (found.name != row.name || found.description != row.description) {
                        refreshed += SkillView(
                            skills.save(row.copy(name = found.name, description = found.description)),
                            null,
                        )
                    }
                }
                is SkillInspection.Problem -> broken += SkillView(row, found.message)
            }
        }

        // Then the folders in the library that have no row yet. An invalid one
        // is skipped quietly: a half-written folder is not an error.
        val known = skills.findAll().map { it.skillPath }.toSet()
        val registered = files.libraryFolders()
            .filter { it !in known }
            .mapNotNull { path ->
                val found = files.inspect(path) as? SkillInspection.Valid ?: return@mapNotNull null
                if (skills.findBySlug(found.slug) != null) return@mapNotNull null
                files.view(
                    skills.save(
                        Skill(slug = found.slug, name = found.name, description = found.description, skillPath = path),
                    ),
                )
            }

        return ScanResult(registered = registered, refreshed = refreshed, broken = broken)
    }
}

@Service
class ListSkillsUseCase(
    private val skills: SkillStore,
    private val files: SkillFiles,
) : ListSkills {

    override fun handle(): List<SkillView> = skills.findAll().map { files.view(it) }
}

@Service
class GetSkillUseCase(
    private val skills: SkillStore,
    private val files: SkillFiles,
) : GetSkill {

    override fun handle(skillId: UUID): SkillDetail {
        val skill = skills.findById(skillId) ?: throw DomainException.NotFound("skill not found")
        return SkillDetail(files.view(skill), files.readBody(skill.skillPath))
    }
}

@Service
class UnregisterSkillUseCase(
    private val skills: SkillStore,
) : UnregisterSkill {

    @Transactional
    override fun handle(skillId: UUID) {
        skills.findById(skillId) ?: throw DomainException.NotFound("skill not found")

        val agents = skills.agentTitlesUsing(skillId)
        if (agents.isNotEmpty()) {
            throw DomainException.Conflict(
                "skill is still assigned to: ${agents.joinToString(", ")} — remove it from them first",
            )
        }
        skills.delete(skillId)
    }
}

@Service
class AssignSkillsUseCase(
    private val agents: AgentStore,
    private val skills: SkillStore,
    private val files: SkillFiles,
) : AssignSkills {

    @Transactional
    override fun handle(command: AssignSkillsCommand): List<AgentSkillView> {
        agents.findById(command.agentId) ?: throw DomainException.NotFound("agent not found")

        val wanted = command.skillIds.distinct()
        val found = skills.findAllById(wanted).associateBy { it.id!! }
        val unknown = wanted.filter { it !in found }
        if (unknown.isNotEmpty()) {
            throw DomainException.Invalid("unknown skill ids: ${unknown.joinToString(", ")}")
        }

        skills.replaceAssignments(command.agentId, wanted)
        return agentSkillViews(command.agentId, agents, skills, files)
    }
}

@Service
class ListAgentSkillsUseCase(
    private val agents: AgentStore,
    private val skills: SkillStore,
    private val files: SkillFiles,
) : ListAgentSkills {

    override fun handle(agentId: UUID): List<AgentSkillView> =
        agentSkillViews(agentId, agents, skills, files)
}

private fun agentSkillViews(
    agentId: UUID,
    agents: AgentStore,
    skills: SkillStore,
    files: SkillFiles,
): List<AgentSkillView> {
    val agent = agents.findById(agentId) ?: throw DomainException.NotFound("agent not found")
    return skills.skillsFor(agentId).map { skill ->
        AgentSkillView(
            skill = files.view(skill),
            shadowedByHarness = files.harnessHasSkill(agent.runtime, agent.harnessPath, skill.slug),
        )
    }
}
