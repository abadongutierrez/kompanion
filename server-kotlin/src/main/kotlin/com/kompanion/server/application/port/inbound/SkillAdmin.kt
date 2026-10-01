package com.kompanion.server.application.port.inbound

import com.kompanion.server.domain.model.Skill
import java.util.UUID

// A skill as the outside sees it: the row, plus whether the folder it points
// at is still usable. problem is null when it is.
data class SkillView(val skill: Skill, val problem: String?) {
    val broken: Boolean get() = problem != null
}

// Add one skill to the library by path.
interface RegisterSkill {
    fun handle(command: RegisterSkillCommand): SkillView
}

data class RegisterSkillCommand(val path: String)

// Register every valid folder under library/skills/ that has no row yet, and
// refresh the cached name and description of the rows that do. A row whose
// folder is gone or invalid is reported as broken and never deleted.
interface ScanSkills {
    fun handle(): ScanResult
}

data class ScanResult(
    val registered: List<SkillView>,
    val refreshed: List<SkillView>,
    val broken: List<SkillView>,
)

interface ListSkills {
    fun handle(): List<SkillView>
}

// One skill with the text of its SKILL.md, for a read-only view.
interface GetSkill {
    fun handle(skillId: UUID): SkillDetail
}

data class SkillDetail(val view: SkillView, val body: String?)

// Remove the row. Refused while any Agent still has the skill. The folder on
// disk is never touched.
interface UnregisterSkill {
    fun handle(skillId: UUID)
}

// An Agent's skills. Assigning replaces the whole set.
interface AssignSkills {
    fun handle(command: AssignSkillsCommand): List<AgentSkillView>
}

data class AssignSkillsCommand(val agentId: UUID, val skillIds: List<UUID>)

interface ListAgentSkills {
    fun handle(agentId: UUID): List<AgentSkillView>
}

// shadowedByHarness: the Agent's harness already carries a skill with this
// slug, so at run time the harness copy wins and this one is skipped.
data class AgentSkillView(val skill: SkillView, val shadowedByHarness: Boolean)
