package com.kompanion.server.controller

import com.kompanion.server.dto.AssignAgentToTeamRequest
import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.HarnessTemplateRequest
import com.kompanion.server.entity.Agent
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.repository.AgentRepository
import com.kompanion.server.repository.TeamRepository
import com.kompanion.server.service.ClaudeHarnessService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.io.File
import java.util.UUID

// The app-wide Agent library, regardless of which Team(s) currently have an
// Agent assigned — Agents are fully independent, the same level as Project
// itself, with no project/team ownership at all.
//
// Create and edit moved to adapter/inbound/web/AgentWriteController as the
// second slice of the migration in ARCHITECTURE.md, taking the harness
// validation and slug rules with them. What is left here — list, delete, and
// the shared CLAUDE.md template — follows in its own slice.
@RestController
@RequestMapping("/api/agents")
class GlobalAgentsController(
    private val agents: AgentRepository,
    private val claudeHarnessService: ClaudeHarnessService,
) {

    @GetMapping
    fun list(): List<Agent> = agents.findAllByOrderByCreatedAt()

    @GetMapping("/{agentId}/harness-template")
    fun getHarnessTemplate(@PathVariable agentId: UUID): ResponseEntity<Any> {
        val agent = agents.findById(agentId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("agent not found"))
        val claudeMd = File(claudeHarnessService.resolveHarnessPath(agent.harnessPath), "CLAUDE.md")
        val content = if (claudeMd.exists()) claudeMd.readText() else ""
        return ResponseEntity.ok(HarnessTemplateRequest(content))
    }

    @PatchMapping("/{agentId}/harness-template")
    fun updateHarnessTemplate(
        @PathVariable agentId: UUID,
        @RequestBody body: HarnessTemplateRequest,
    ): ResponseEntity<Any> {
        val agent = agents.findById(agentId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("agent not found"))
        File(claudeHarnessService.resolveHarnessPath(agent.harnessPath), "CLAUDE.md").writeText(body.content)
        return ResponseEntity.ok(HarnessTemplateRequest(body.content))
    }
}

// Team-scoped: which Agents this Team currently has assigned (team_agents),
// plus assign/unassign. Agents are only ever created via the global
// /api/agents library above — this controller is assignment-only.
// team_agents has no dedicated entity — handled directly via JdbcTemplate,
// same hybrid approach as task_repositories.
@RestController
@RequestMapping("/api/teams/{teamId}/agents")
class TeamAgentsController(
    private val agents: AgentRepository,
    private val teams: TeamRepository,
    private val jdbc: JdbcTemplate,
) {

    @GetMapping
    fun list(@PathVariable teamId: UUID): List<Agent> = jdbc.query(
        """
        select r.* from agents r
        join team_agents tr on tr.agent_id = r.id
        where tr.team_id = ?
        order by r.created_at
        """.trimIndent(),
        { rs, _ ->
            Agent(
                id = UUID.fromString(rs.getString("id")),
                title = rs.getString("title"),
                slug = rs.getString("slug"),
                harnessPath = rs.getString("harness_path"),
                // Hand-rolled row mapping, so new columns have to be added
                // here too — omitting these silently defaulted every
                // team-scoped Agent back to Claude Code.
                runtime = AgentRuntime.valueOf(rs.getString("runtime")),
                model = rs.getString("model"),
                createdAt = rs.getObject("created_at", java.time.OffsetDateTime::class.java),
            )
        },
        teamId,
    )

    @PostMapping
    fun assign(@PathVariable teamId: UUID, @RequestBody body: AssignAgentToTeamRequest): ResponseEntity<Any> {
        if (!teams.existsById(teamId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("team not found"))
        }
        val agent = agents.findById(body.agentId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("agent not found"))

        jdbc.update(
            "insert into team_agents (team_id, agent_id) values (?, ?) on conflict do nothing",
            teamId,
            agent.id,
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(agent)
    }

    @DeleteMapping("/{agentId}")
    fun unassign(@PathVariable teamId: UUID, @PathVariable agentId: UUID): ResponseEntity<Any> {
        val deleted = jdbc.update(
            "delete from team_agents where team_id = ? and agent_id = ?",
            teamId,
            agentId,
        )
        if (deleted == 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("agent is not assigned to this team"))
        }
        return ResponseEntity.noContent().build()
    }
}
