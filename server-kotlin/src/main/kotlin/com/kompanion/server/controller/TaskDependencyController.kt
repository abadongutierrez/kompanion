package com.kompanion.server.controller

import com.kompanion.server.dto.CreateTaskDependencyRequest
import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.TaskDependencyResponse
import com.kompanion.server.entity.TaskDependency
import com.kompanion.server.repository.TaskDependencyRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/teams/{teamId}/tasks/{taskId}/dependencies")
class TaskDependencyController(
    private val dependencies: TaskDependencyRepository,
    private val jdbc: JdbcTemplate,
) {

    private fun relatedTitle(relatedTaskId: UUID): String? =
        jdbc.query(
            "select title from tasks where id = ?",
            { rs, _ -> rs.getString("title") },
            relatedTaskId,
        ).firstOrNull()

    private fun toResponse(dep: TaskDependency) = TaskDependencyResponse(
        id = dep.id!!,
        taskId = dep.taskId,
        relatedTaskId = dep.relatedTaskId,
        relatedTaskTitle = relatedTitle(dep.relatedTaskId),
        type = dep.type,
        createdAt = dep.createdAt,
    )

    @GetMapping
    fun list(@PathVariable teamId: UUID, @PathVariable taskId: UUID): List<TaskDependencyResponse> =
        dependencies.findByTaskIdOrderByCreatedAt(taskId).map { toResponse(it) }

    @PostMapping
    fun create(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @RequestBody body: CreateTaskDependencyRequest,
    ): ResponseEntity<Any> {
        if (body.relatedTaskId == taskId) {
            return ResponseEntity.badRequest().body(ErrorResponse("a task cannot depend on itself"))
        }
        val saved = try {
            dependencies.save(
                TaskDependency(taskId = taskId, relatedTaskId = body.relatedTaskId, type = body.type),
            )
        } catch (e: DataIntegrityViolationException) {
            // Mirrors `on conflict (task_id, related_task_id, type) do
            // nothing` + "no row returned" -> 409 in the original: the
            // unique constraint on (task_id, related_task_id, type) is what
            // throws here instead.
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse("this dependency already exists"))
        }
        // createdAt is @ReadOnlyProperty (DB default now()) — re-fetch to
        // return the fully populated row, matching `returning *`.
        val reloaded = dependencies.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(reloaded))
    }

    @DeleteMapping("/{dependencyId}")
    fun delete(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @PathVariable dependencyId: UUID,
    ): ResponseEntity<Any> {
        if (!dependencies.existsById(dependencyId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("dependency not found"))
        }
        dependencies.deleteById(dependencyId)
        return ResponseEntity.noContent().build()
    }
}
