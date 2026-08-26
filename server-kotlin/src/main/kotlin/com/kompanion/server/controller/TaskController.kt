package com.kompanion.server.controller

import com.kompanion.server.dto.AssignAgentRequest
import com.kompanion.server.dto.CreateTaskRequest
import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.LinkRepositoryRequest
import com.kompanion.server.dto.TaskWithRepositoriesResponse
import com.kompanion.server.dto.UpdateTaskRequest
import com.kompanion.server.dto.UpdateTaskStatusRequest
import com.kompanion.server.entity.Task
import com.kompanion.server.entity.TaskStatus
import com.kompanion.server.entity.TaskType
import com.kompanion.server.entity.isValidTaskTransition
import com.kompanion.server.repository.AgentRepository
import com.kompanion.server.repository.TaskRepository
import com.kompanion.server.service.NoHarnessException
import com.kompanion.server.service.OverBudgetException
import com.kompanion.server.service.RunTaskService
import com.kompanion.server.service.TaskAlreadyRunningException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.time.OffsetDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/teams/{teamId}/tasks")
class TaskController(
    private val tasks: TaskRepository,
    private val agents: AgentRepository,
    private val jdbc: JdbcTemplate,
    private val runTaskService: RunTaskService,
) {

    // repositoryIds comes from an array_agg join across task_repositories —
    // doesn't fit a single-aggregate Spring Data JDBC repository mapping,
    // so this one read uses JdbcTemplate directly (the hybrid approach
    // called out in the Phase 1 plan for exactly this kind of query).
    private fun toResponse(rs: java.sql.ResultSet): TaskWithRepositoriesResponse {
        val repoIdsArray = rs.getArray("repository_ids")
        val repositoryIds = (repoIdsArray?.array as? Array<*>)
            ?.map { UUID.fromString(it.toString()) }
            ?: emptyList()
        return TaskWithRepositoriesResponse(
            id = UUID.fromString(rs.getString("id")),
            teamId = UUID.fromString(rs.getString("team_id")),
            agentId = rs.getString("agent_id")?.let { UUID.fromString(it) },
            title = rs.getString("title"),
            description = rs.getString("description"),
            type = TaskType.valueOf(rs.getString("type")),
            status = TaskStatus.valueOf(rs.getString("status")),
            storyPoints = rs.getObject("story_points") as Int?,
            acceptanceCriteria = rs.getString("acceptance_criteria"),
            branchOrPrLink = rs.getString("branch_or_pr_link"),
            runningSince = rs.getObject("running_since", OffsetDateTime::class.java),
            createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
            repositoryIds = repositoryIds,
        )
    }

    @GetMapping
    fun list(@PathVariable teamId: UUID): List<TaskWithRepositoriesResponse> = jdbc.query(
        """
        select
          t.*,
          coalesce(
            array_agg(tr.repository_id) filter (where tr.repository_id is not null),
            '{}'
          ) as repository_ids
        from tasks t
        left join task_repositories tr on tr.task_id = t.id
        where t.team_id = ?
        group by t.id
        order by t.created_at
        """.trimIndent(),
        { rs, _ -> toResponse(rs) },
        teamId,
    )

    private fun findOneWithRepositories(taskId: UUID): TaskWithRepositoriesResponse? = jdbc.query(
        """
        select
          t.*,
          coalesce(
            array_agg(tr.repository_id) filter (where tr.repository_id is not null),
            '{}'
          ) as repository_ids
        from tasks t
        left join task_repositories tr on tr.task_id = t.id
        where t.id = ?
        group by t.id
        """.trimIndent(),
        { rs, _ -> toResponse(rs) },
        taskId,
    ).firstOrNull()

    // A task is "running" while some agent has a live run on it —
    // running_since is the single server-side signal for that (set when a
    // run starts, cleared when it ends). While that holds, the task is
    // frozen: no field edits, no re-assignment, no repository changes and
    // no delete, so an in-flight run can't have the ground shift under it.
    private fun runningConflict(task: Task): ResponseEntity<Any>? =
        if (task.runningSince != null) {
            ResponseEntity.status(HttpStatus.CONFLICT).body(
                ErrorResponse("task is running and cannot be modified until the run finishes"),
            )
        } else {
            null
        }

    @PostMapping
    fun create(
        @PathVariable teamId: UUID,
        @RequestBody body: CreateTaskRequest,
    ): ResponseEntity<TaskWithRepositoriesResponse> {
        val now = OffsetDateTime.now()
        val saved = tasks.save(
            Task(
                teamId = teamId,
                agentId = body.agentId,
                title = body.title,
                description = body.description,
                type = body.type,
                status = TaskStatus.backlog,
                storyPoints = body.storyPoints,
                acceptanceCriteria = body.acceptanceCriteria,
                updatedAt = now,
            ),
        )
        val taskId = saved.id!!
        body.repositoryIds?.forEach { repositoryId ->
            jdbc.update(
                "insert into task_repositories (task_id, repository_id) values (?, ?)",
                taskId,
                repositoryId,
            )
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(findOneWithRepositories(taskId))
    }

    @PatchMapping("/{taskId}/status")
    fun updateStatus(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @RequestBody body: UpdateTaskStatusRequest,
    ): ResponseEntity<Any> {
        val existing = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))

        if (!isValidTaskTransition(existing.status, body.status)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse("cannot transition task from ${existing.status} to ${body.status}"))
        }

        tasks.save(existing.copy(status = body.status, updatedAt = OffsetDateTime.now()))
        return ResponseEntity.ok(findOneWithRepositories(taskId))
    }

    @PatchMapping("/{taskId}")
    fun update(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @RequestBody body: UpdateTaskRequest,
    ): ResponseEntity<Any> {
        val existing = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))
        runningConflict(existing)?.let { return it }

        tasks.save(
            existing.copy(
                title = body.title ?: existing.title,
                type = body.type ?: existing.type,
                description = if (body.description != null) body.description else existing.description,
                storyPoints = body.storyPoints ?: existing.storyPoints,
                acceptanceCriteria = body.acceptanceCriteria ?: existing.acceptanceCriteria,
                updatedAt = OffsetDateTime.now(),
            ),
        )
        return ResponseEntity.ok(findOneWithRepositories(taskId))
    }

    @DeleteMapping("/{taskId}")
    fun delete(@PathVariable teamId: UUID, @PathVariable taskId: UUID): ResponseEntity<Any> {
        // Cascades to task_runs, task_repositories, and task_dependencies
        // (both directions) via FK constraints — nothing left orphaned in
        // the DB. Deliberately NOT cleaned up: any on-disk scratch
        // workspace or git worktree this task used.
        val existing = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))
        runningConflict(existing)?.let { return it }
        tasks.deleteById(taskId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{taskId}/repositories")
    fun linkRepository(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @RequestBody body: LinkRepositoryRequest,
    ): ResponseEntity<Any> {
        val existing = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))
        runningConflict(existing)?.let { return it }
        jdbc.update(
            "insert into task_repositories (task_id, repository_id) values (?, ?) on conflict do nothing",
            taskId,
            body.repositoryId,
        )
        return ResponseEntity.noContent().build()
    }

    @DeleteMapping("/{taskId}/repositories/{repositoryId}")
    fun unlinkRepository(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @PathVariable repositoryId: UUID,
    ): ResponseEntity<Any> {
        val existing = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))
        runningConflict(existing)?.let { return it }
        jdbc.update(
            "delete from task_repositories where task_id = ? and repository_id = ?",
            taskId,
            repositoryId,
        )
        return ResponseEntity.noContent().build()
    }

    @PatchMapping("/{taskId}/agent")
    fun assignAgent(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @RequestBody body: AssignAgentRequest,
    ): ResponseEntity<Any> {
        val existing = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))
        runningConflict(existing)?.let { return it }
        tasks.save(existing.copy(agentId = body.agentId, updatedAt = OffsetDateTime.now()))
        return ResponseEntity.ok(findOneWithRepositories(taskId))
    }

    @PostMapping("/{taskId}/run")
    fun run(@PathVariable teamId: UUID, @PathVariable taskId: UUID): ResponseEntity<Any> {
        val task = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))
        if (task.runningSince != null) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse("task is already running"))
        }
        val agentId = task.agentId
            ?: return ResponseEntity.badRequest().body(ErrorResponse("task has no agent assigned"))
        val agent = agents.findById(agentId).orElse(null)
            ?: return ResponseEntity.badRequest().body(ErrorResponse("assigned agent not found"))

        return try {
            ResponseEntity.status(HttpStatus.CREATED).body(runTaskService.runTaskWithClaude(task, agent))
        } catch (e: NoHarnessException) {
            ResponseEntity.badRequest()
                .body(ErrorResponse("no harness directory found at agent's harnessPath \"${agent.harnessPath}\""))
        } catch (e: TaskAlreadyRunningException) {
            // Lost the race against a concurrent start — the pre-check above
            // catches the common case, this catches the narrow window.
            ResponseEntity.status(HttpStatus.CONFLICT).body(ErrorResponse("task is already running"))
        } catch (e: OverBudgetException) {
            // Still a 201: a task_runs record was created (status
            // "over_budget"), just refused before spending anything —
            // model it as a run outcome, not an HTTP error, so the client
            // renders it the same way as any other run result.
            ResponseEntity.status(HttpStatus.CREATED).body(e.run)
        } catch (e: Exception) {
            // Anything else (e.g. a worktree/git failure) is a real bug or
            // bad repo state, not one of the two known refusal paths above
            // — surface it as a clean JSON error.
            System.err.println("task run failed: ${e.message}")
            ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse(e.message ?: "run failed"))
        }
    }

    @GetMapping("/{taskId}/runs")
    fun runs(@PathVariable teamId: UUID, @PathVariable taskId: UUID) = runTaskService.listRuns(taskId)
}
