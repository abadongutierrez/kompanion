package com.kompanion.server.controller

import com.kompanion.server.dto.AssignAgentToTeamRequest
import com.kompanion.server.dto.CreateAgentRequest
import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.HarnessTemplateRequest
import com.kompanion.server.dto.UpdateAgentRequest
import com.kompanion.server.entity.Agent
import com.kompanion.server.entity.AgentRuntime
import com.kompanion.server.repository.AgentRepository
import com.kompanion.server.repository.TeamRepository
import com.kompanion.server.service.ClaudeHarnessService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.io.File
import java.util.UUID

private fun slugify(title: String): String =
    title.lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .replace(Regex("(^-|-$)"), "")

// The app-wide Agent library: create, edit, and the shared CLAUDE.md
// template all operate on the Agent itself here, regardless of which
// Team(s) currently have it assigned — Agents are fully independent, the
// same level as Project itself, with no project/team ownership at all.
@RestController
@RequestMapping("/api/agents")
class GlobalAgentsController(
    private val agents: AgentRepository,
    private val claudeHarnessService: ClaudeHarnessService,
) {

    // No scaffolding happens here — the operator is expected to have already
    // created the harness directory at harnessPath. We only validate it's
    // really there, same as Repositories. Accepts either an absolute path or
    // one relative to WORKSPACE_ROOT.
    //
    // What counts as valid depends on the runtime: Claude Code reads
    // .claude/, opencode reads .opencode/ and AGENTS.md. A folder can carry
    // both and serve either.
    private fun validateHarnessPath(harnessPath: String, runtime: AgentRuntime): String? {
        val dir = claudeHarnessService.resolveHarnessPath(harnessPath)
        if (!dir.exists()) {
            return "no directory at \"${dir.path}\" — create the harness there first, then register it"
        }
        return when (runtime) {
            AgentRuntime.claude_code ->
                if (File(dir, ".claude").exists()) null
                else "\"${dir.path}\" exists but has no .claude/ config — it isn't a valid Claude Code harness"
            AgentRuntime.opencode ->
                if (File(dir, ".opencode").exists() || File(dir, "AGENTS.md").exists()) null
                else "\"${dir.path}\" exists but has neither .opencode/ nor AGENTS.md — it isn't a valid opencode harness"
        }
    }

    // Rejects an unknown runtime with a 400 naming the accepted values rather
    // than letting valueOf throw a 500.
    private fun parseRuntime(raw: String?): Result<AgentRuntime?> =
        when (raw) {
            null -> Result.success(null)
            else -> runCatching { AgentRuntime.valueOf(raw) }
                .recoverCatching {
                    throw IllegalArgumentException(
                        "unknown runtime \"$raw\" — expected one of ${AgentRuntime.entries.joinToString(", ") { it.name }}",
                    )
                }
        }

    // An Agent's slug is its only stable, machine-usable identifier (e.g.
    // the Project Manager team-snapshot gate keys off slug ==
    // "project-manager"). Unique app-wide — on collision, append -2, -3,
    // ... rather than fail. excludeAgentId lets an update keep its own
    // slug when it didn't change.
    private fun uniqueSlug(title: String, excludeAgentId: UUID? = null): String {
        val base = slugify(title).ifEmpty { "agent" }
        var candidate = base
        var suffix = 2
        while (true) {
            val existing = if (excludeAgentId != null) {
                agents.findBySlugAndIdNot(candidate, excludeAgentId)
            } else {
                agents.findBySlug(candidate)
            }
            if (existing == null) return candidate
            candidate = "$base-$suffix"
            suffix += 1
        }
    }

    @GetMapping
    fun list(): List<Agent> = agents.findAllByOrderByCreatedAt()

    @PostMapping
    fun create(@RequestBody body: CreateAgentRequest): ResponseEntity<Any> {
        val runtime = parseRuntime(body.runtime).getOrElse {
            return ResponseEntity.badRequest().body(ErrorResponse(it.message ?: "invalid runtime"))
        } ?: AgentRuntime.claude_code

        validateHarnessPath(body.harnessPath, runtime)?.let {
            return ResponseEntity.badRequest().body(ErrorResponse(it))
        }
        val slug = uniqueSlug(body.title)
        // createdAt is @ReadOnlyProperty (DB default now()) — re-fetch to
        // return the fully populated row, matching `returning *`.
        val saved = agents.save(
            Agent(
                title = body.title,
                slug = slug,
                harnessPath = claudeHarnessService.toStoredHarnessPath(body.harnessPath),
                runtime = runtime,
                model = body.model?.ifBlank { null },
            ),
        )
        val reloaded = agents.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(reloaded)
    }

    @PatchMapping("/{agentId}")
    fun update(@PathVariable agentId: UUID, @RequestBody body: UpdateAgentRequest): ResponseEntity<Any> {
        val requestedRuntime = parseRuntime(body.runtime).getOrElse {
            return ResponseEntity.badRequest().body(ErrorResponse(it.message ?: "invalid runtime"))
        }
        val existing = agents.findById(agentId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("agent not found"))

        // Re-validate whenever either half of (path, runtime) changes — a
        // .claude/-only harness stops being valid the moment the Agent
        // switches to opencode, and saying so now beats failing at run time.
        val runtime = requestedRuntime ?: existing.runtime
        val harnessPath = body.harnessPath ?: existing.harnessPath
        if (body.harnessPath != null || requestedRuntime != null) {
            validateHarnessPath(harnessPath, runtime)?.let {
                return ResponseEntity.badRequest().body(ErrorResponse(it))
            }
        }

        body.slug?.let { slug ->
            val collision = agents.findBySlugAndIdNot(slug, agentId)
            if (collision != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ErrorResponse("slug \"$slug\" is already used by another agent"))
            }
        }

        val updated = existing.copy(
            title = body.title ?: existing.title,
            slug = body.slug ?: existing.slug,
            harnessPath = body.harnessPath?.let { claudeHarnessService.toStoredHarnessPath(it) }
                ?: existing.harnessPath,
            runtime = runtime,
            // Blank clears it back to the CLI default; absent leaves it alone.
            model = body.model?.ifBlank { null } ?: existing.model.takeIf { body.model == null },
        )
        return ResponseEntity.ok(agents.save(updated))
    }

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
