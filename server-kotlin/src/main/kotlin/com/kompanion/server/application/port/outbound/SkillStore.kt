package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.Skill
import java.util.UUID

// The skills table and the agent_skills links. Rows only: whether the folder
// a row points at is still there is SkillFiles' question.
interface SkillStore {

    fun findById(id: UUID): Skill?

    fun findBySlug(slug: String): Skill?

    // Ordered by slug, so a list is stable.
    fun findAll(): List<Skill>

    fun findAllById(ids: Collection<UUID>): List<Skill>

    fun save(skill: Skill): Skill

    fun delete(id: UUID)

    // Titles of the Agents this skill is assigned to, for the message that
    // says why it cannot be unregistered.
    fun agentTitlesUsing(skillId: UUID): List<String>

    // The skills an Agent has been taught, ordered by slug.
    fun skillsFor(agentId: UUID): List<Skill>

    // Replaces the Agent's whole set. The caller has already checked the ids.
    fun replaceAssignments(agentId: UUID, skillIds: Collection<UUID>)
}
