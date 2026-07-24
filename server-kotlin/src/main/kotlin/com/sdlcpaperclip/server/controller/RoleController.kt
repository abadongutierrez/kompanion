package com.sdlcpaperclip.server.controller

import com.sdlcpaperclip.server.dto.CreateRoleRequest
import com.sdlcpaperclip.server.dto.ErrorResponse
import com.sdlcpaperclip.server.dto.UpdateRoleRequest
import com.sdlcpaperclip.server.entity.Role
import com.sdlcpaperclip.server.repository.RoleRepository
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.io.File
import java.util.UUID

@RestController
@RequestMapping("/api/teams/{teamId}/roles")
class RoleController(private val roles: RoleRepository) {

    private fun slugify(title: String): String =
        title.lowercase()
            .replace(Regex("[^a-z0-9]+"), "-")
            .replace(Regex("(^-|-$)"), "")

    // A Role's slug is its only stable, machine-usable identifier (e.g. the
    // Project Manager team-snapshot gate keys off slug === "project-manager").
    // Unique per team — on collision, append -2, -3, ... rather than fail.
    // excludeRoleId lets an update keep its own slug when the title didn't
    // meaningfully change (or just re-derive cleanly if it did).
    private fun uniqueSlugForTeam(teamId: UUID, title: String, excludeRoleId: UUID? = null): String {
        val base = slugify(title).ifEmpty { "role" }
        var candidate = base
        var suffix = 2
        while (true) {
            val existing = if (excludeRoleId != null) {
                roles.findByTeamIdAndSlugAndIdNot(teamId, candidate, excludeRoleId)
            } else {
                roles.findByTeamIdAndSlug(teamId, candidate)
            }
            if (existing == null) return candidate
            candidate = "$base-$suffix"
            suffix += 1
        }
    }

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

    @GetMapping
    fun list(@PathVariable teamId: UUID): List<Role> = roles.findByTeamIdOrderByCreatedAt(teamId)

    @PostMapping
    fun create(
        @PathVariable teamId: UUID,
        @RequestBody body: CreateRoleRequest,
    ): ResponseEntity<Any> {
        validateHarnessPath(body.harnessPath)?.let {
            return ResponseEntity.badRequest().body(ErrorResponse(it))
        }
        val slug = uniqueSlugForTeam(teamId, body.title)
        // createdAt is @ReadOnlyProperty (DB default now()) — re-fetch to
        // return the fully populated row, matching `returning *`.
        val saved = roles.save(
            Role(teamId = teamId, title = body.title, slug = slug, harnessPath = body.harnessPath),
        )
        val reloaded = roles.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(reloaded)
    }

    @PatchMapping("/{roleId}")
    fun update(
        @PathVariable teamId: UUID,
        @PathVariable roleId: UUID,
        @RequestBody body: UpdateRoleRequest,
    ): ResponseEntity<Any> {
        body.harnessPath?.let { path ->
            validateHarnessPath(path)?.let {
                return ResponseEntity.badRequest().body(ErrorResponse(it))
            }
        }
        val existing = roles.findById(roleId).orElse(null)
            ?.takeIf { it.teamId == teamId }
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("role not found"))

        val slug = body.title?.let { uniqueSlugForTeam(teamId, it, roleId) } ?: existing.slug

        val updated = existing.copy(
            title = body.title ?: existing.title,
            slug = slug,
            harnessPath = body.harnessPath ?: existing.harnessPath,
        )
        return ResponseEntity.ok(roles.save(updated))
    }
}
