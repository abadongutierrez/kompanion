package com.kompanion.server.controller

import com.kompanion.server.dto.CreateProjectRequest
import com.kompanion.server.entity.Project
import com.kompanion.server.repository.ProjectRepository
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/projects")
class ProjectController(private val projects: ProjectRepository) {

    @GetMapping
    fun list(): List<Project> = projects.findAllByOrderByCreatedAt()

    @PostMapping
    fun create(@RequestBody body: CreateProjectRequest): ResponseEntity<Project> {
        // createdAt is @ReadOnlyProperty (DB default now()) — save() doesn't
        // re-read it, only the generated id, so re-fetch to return the fully
        // populated row, matching the original SQL's `returning *`.
        val saved = projects.save(Project(name = body.name))
        val reloaded = projects.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(reloaded)
    }
}
