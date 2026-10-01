package com.kompanion.server.adapter.inbound.web

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
import com.kompanion.server.application.port.inbound.SkillView
import com.kompanion.server.application.port.inbound.UnregisterSkill
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

// The skills library. New endpoints, so they are built in the ARCHITECTURE.md
// layout from the start, including their wire types: nothing here shares a
// DTO with a legacy controller.
@RestController
@RequestMapping("/api/skills")
class SkillController(
    private val listSkills: ListSkills,
    private val getSkill: GetSkill,
    private val registerSkill: RegisterSkill,
    private val scanSkills: ScanSkills,
    private val unregisterSkill: UnregisterSkill,
) {

    @GetMapping
    fun list(): List<SkillResponse> = listSkills.handle().map { it.toResponse() }

    @GetMapping("/{skillId}")
    fun get(@PathVariable skillId: UUID): SkillDetailResponse {
        val detail = getSkill.handle(skillId)
        return SkillDetailResponse(skill = detail.view.toResponse(), body = detail.body)
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun register(@RequestBody body: RegisterSkillRequest): SkillResponse =
        registerSkill.handle(RegisterSkillCommand(body.path.trim())).toResponse()

    @PostMapping("/scan")
    fun scan(): ScanResponse = scanSkills.handle().toResponse()

    @DeleteMapping("/{skillId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun unregister(@PathVariable skillId: UUID) = unregisterSkill.handle(skillId)
}

// An Agent's skills, under the Agent's own path. A separate controller so the
// Agent endpoints and their response are left exactly as they were.
@RestController
@RequestMapping("/api/agents/{agentId}/skills")
class AgentSkillsController(
    private val listAgentSkills: ListAgentSkills,
    private val assignSkills: AssignSkills,
) {

    @GetMapping
    fun list(@PathVariable agentId: UUID): List<AgentSkillResponse> =
        listAgentSkills.handle(agentId).map { it.toResponse() }

    // Replaces the whole set: skills not in the list are un-taught.
    @PutMapping
    fun assign(@PathVariable agentId: UUID, @RequestBody body: AssignSkillsRequest): List<AgentSkillResponse> =
        assignSkills.handle(AssignSkillsCommand(agentId, body.skillIds)).map { it.toResponse() }
}

data class RegisterSkillRequest(val path: String)

data class AssignSkillsRequest(val skillIds: List<UUID>)

data class SkillResponse(
    val id: UUID,
    val slug: String,
    val name: String,
    val description: String,
    val skillPath: String,
    val broken: Boolean,
    val problem: String?,
    val createdAt: OffsetDateTime?,
)

data class SkillDetailResponse(val skill: SkillResponse, val body: String?)

data class ScanResponse(
    val registered: List<SkillResponse>,
    val refreshed: List<SkillResponse>,
    val broken: List<SkillResponse>,
)

data class AgentSkillResponse(val skill: SkillResponse, val shadowedByHarness: Boolean)

private fun SkillView.toResponse() = SkillResponse(
    id = skill.id!!,
    slug = skill.slug,
    name = skill.name,
    description = skill.description,
    skillPath = skill.skillPath,
    broken = broken,
    problem = problem,
    createdAt = skill.createdAt,
)

private fun ScanResult.toResponse() = ScanResponse(
    registered = registered.map { it.toResponse() },
    refreshed = refreshed.map { it.toResponse() },
    broken = broken.map { it.toResponse() },
)

private fun AgentSkillView.toResponse() = AgentSkillResponse(skill.toResponse(), shadowedByHarness)
