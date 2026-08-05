package com.kompanion.server.controller

import com.kompanion.server.dto.AssignRoleToTeamRequest
import com.kompanion.server.dto.CreateRoleRequest
import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.HarnessTemplateRequest
import com.kompanion.server.dto.UpdateRoleRequest
import com.kompanion.server.entity.Role
import com.kompanion.server.repository.RoleRepository
import com.kompanion.server.repository.TeamRepository
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

// No scaffolding happens here — the operator is expected to have already
// created the harness directory (with its own .claude/ config) at
// harnessPath. We only validate it's really there, same as Repositories.
private fun validateHarnessPath(harnessPath: String): String? {
    val dir = File(harnessPath)
    if (!dir.exists()) {
        return "no directory at \"$harnessPath\" — create the harness there first (with a .claude/ config), then register it"
    }
    if (!File(dir, ".claude").exists()) {
        return "\"$harnessPath\" exists but has no .claude/ config — it isn't a valid harness directory"
    }
    return null
}

// The app-wide Role library: create, edit, and the shared CLAUDE.md
// template all operate on the Role itself here, regardless of which
// Team(s) currently have it assigned — Roles are fully independent, the
// same level as Project itself, with no project/team ownership at all.
@RestController
@RequestMapping("/api/roles")
class GlobalRolesController(private val roles: RoleRepository) {

    // A Role's slug is its only stable, machine-usable identifier (e.g.
    // the Project Manager team-snapshot gate keys off slug ==
    // "project-manager"). Unique app-wide — on collision, append -2, -3,
    // ... rather than fail. excludeRoleId lets an update keep its own
    // slug when it didn't change.
    private fun uniqueSlug(title: String, excludeRoleId: UUID? = null): String {
        val base = slugify(title).ifEmpty { "role" }
        var candidate = base
        var suffix = 2
        while (true) {
            val existing = if (excludeRoleId != null) {
                roles.findBySlugAndIdNot(candidate, excludeRoleId)
            } else {
                roles.findBySlug(candidate)
            }
            if (existing == null) return candidate
            candidate = "$base-$suffix"
            suffix += 1
        }
    }

    @GetMapping
    fun list(): List<Role> = roles.findAllByOrderByCreatedAt()

    @PostMapping
    fun create(@RequestBody body: CreateRoleRequest): ResponseEntity<Any> {
        validateHarnessPath(body.harnessPath)?.let {
            return ResponseEntity.badRequest().body(ErrorResponse(it))
        }
        val slug = uniqueSlug(body.title)
        // createdAt is @ReadOnlyProperty (DB default now()) — re-fetch to
        // return the fully populated row, matching `returning *`.
        val saved = roles.save(Role(title = body.title, slug = slug, harnessPath = body.harnessPath))
        val reloaded = roles.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(reloaded)
    }

    @PatchMapping("/{roleId}")
    fun update(@PathVariable roleId: UUID, @RequestBody body: UpdateRoleRequest): ResponseEntity<Any> {
        body.harnessPath?.let { path ->
            validateHarnessPath(path)?.let {
                return ResponseEntity.badRequest().body(ErrorResponse(it))
            }
        }
        val existing = roles.findById(roleId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("role not found"))

        body.slug?.let { slug ->
            val collision = roles.findBySlugAndIdNot(slug, roleId)
            if (collision != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ErrorResponse("slug \"$slug\" is already used by another role"))
            }
        }

        val updated = existing.copy(
            title = body.title ?: existing.title,
            slug = body.slug ?: existing.slug,
            harnessPath = body.harnessPath ?: existing.harnessPath,
        )
        return ResponseEntity.ok(roles.save(updated))
    }

    @GetMapping("/{roleId}/harness-template")
    fun getHarnessTemplate(@PathVariable roleId: UUID): ResponseEntity<Any> {
        val role = roles.findById(roleId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("role not found"))
        val claudeMd = File(role.harnessPath, "CLAUDE.md")
        val content = if (claudeMd.exists()) claudeMd.readText() else ""
        return ResponseEntity.ok(HarnessTemplateRequest(content))
    }

    @PatchMapping("/{roleId}/harness-template")
    fun updateHarnessTemplate(
        @PathVariable roleId: UUID,
        @RequestBody body: HarnessTemplateRequest,
    ): ResponseEntity<Any> {
        val role = roles.findById(roleId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("role not found"))
        File(role.harnessPath, "CLAUDE.md").writeText(body.content)
        return ResponseEntity.ok(HarnessTemplateRequest(body.content))
    }
}

// Team-scoped: which Roles this Team currently has assigned (team_roles),
// plus assign/unassign. Roles are only ever created via the global
// /api/roles library above — this controller is assignment-only.
// team_roles has no dedicated entity — handled directly via JdbcTemplate,
// same hybrid approach as task_repositories.
@RestController
@RequestMapping("/api/teams/{teamId}/roles")
class TeamRolesController(
    private val roles: RoleRepository,
    private val teams: TeamRepository,
    private val jdbc: JdbcTemplate,
) {

    @GetMapping
    fun list(@PathVariable teamId: UUID): List<Role> = jdbc.query(
        """
        select r.* from roles r
        join team_roles tr on tr.role_id = r.id
        where tr.team_id = ?
        order by r.created_at
        """.trimIndent(),
        { rs, _ ->
            Role(
                id = UUID.fromString(rs.getString("id")),
                title = rs.getString("title"),
                slug = rs.getString("slug"),
                harnessPath = rs.getString("harness_path"),
                createdAt = rs.getObject("created_at", java.time.OffsetDateTime::class.java),
            )
        },
        teamId,
    )

    @PostMapping
    fun assign(@PathVariable teamId: UUID, @RequestBody body: AssignRoleToTeamRequest): ResponseEntity<Any> {
        if (!teams.existsById(teamId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("team not found"))
        }
        val role = roles.findById(body.roleId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("role not found"))

        jdbc.update(
            "insert into team_roles (team_id, role_id) values (?, ?) on conflict do nothing",
            teamId,
            role.id,
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(role)
    }

    @DeleteMapping("/{roleId}")
    fun unassign(@PathVariable teamId: UUID, @PathVariable roleId: UUID): ResponseEntity<Any> {
        val deleted = jdbc.update(
            "delete from team_roles where team_id = ? and role_id = ?",
            teamId,
            roleId,
        )
        if (deleted == 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("role is not assigned to this team"))
        }
        return ResponseEntity.noContent().build()
    }
}
