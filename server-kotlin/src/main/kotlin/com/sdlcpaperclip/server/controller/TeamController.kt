package com.sdlcpaperclip.server.controller

import com.sdlcpaperclip.server.dto.CreateTeamRequest
import com.sdlcpaperclip.server.entity.Team
import com.sdlcpaperclip.server.repository.TeamRepository
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/projects/{projectId}/teams")
class TeamController(private val teams: TeamRepository) {

    @GetMapping
    fun list(@PathVariable projectId: UUID): List<Team> =
        teams.findByProjectIdOrderByCreatedAt(projectId)

    @PostMapping
    fun create(
        @PathVariable projectId: UUID,
        @RequestBody body: CreateTeamRequest,
    ): ResponseEntity<Team> {
        // createdAt is @ReadOnlyProperty (DB default now()) — re-fetch to
        // return the fully populated row, matching `returning *`.
        val saved = teams.save(Team(projectId = projectId, name = body.name))
        val reloaded = teams.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(reloaded)
    }
}
