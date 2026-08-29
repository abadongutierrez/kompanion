package com.kompanion.server.controller

import com.kompanion.server.dto.CreateProjectRequest
import com.kompanion.server.entity.Project
import com.kompanion.server.repository.ProjectRepository
import com.kompanion.server.service.ClaudeHarnessService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/projects")
class ProjectController(
    private val projects: ProjectRepository,
    private val claudeHarnessService: ClaudeHarnessService,
) {

    @GetMapping
    fun list(): List<Project> = projects.findAllByOrderByCreatedAt()

    @PostMapping
    fun create(@RequestBody body: CreateProjectRequest): ResponseEntity<Project> {
        // createdAt is @ReadOnlyProperty (DB default now()) — save() doesn't
        // re-read it, only the generated id, so re-fetch to return the fully
        // populated row, matching the original SQL's `returning *`.
        val saved = projects.save(Project(name = body.name))

        // The default needs the id, which only exists after that first save —
        // hence two writes rather than one. The id suffix is what keeps two
        // projects with the same name out of each other's folder.
        val workspacePath = body.workspacePath?.takeIf { it.isNotBlank() }
            ?.let { claudeHarnessService.toStoredPath(it.trim()) }
            ?: "projects/${slugify(body.name)}-${saved.id!!.toString().take(8)}"

        // Unlike a repository's localPath, this folder is ours, so it is
        // created rather than required to exist. Doing it now means the
        // operator can see (and populate) it before the first task ever runs.
        claudeHarnessService.resolveHarnessPath(workspacePath).mkdirs()

        projects.save(saved.copy(workspacePath = workspacePath))
        val reloaded = projects.findById(saved.id!!).orElse(saved.copy(workspacePath = workspacePath))
        return ResponseEntity.status(HttpStatus.CREATED).body(reloaded)
    }

    private fun slugify(name: String): String =
        name.lowercase()
            .replace(Regex("[^a-z0-9]+"), "-")
            .replace(Regex("(^-|-$)"), "")
            .ifEmpty { "project" }
}
