package com.kompanion.server.controller

import com.kompanion.server.dto.CreateTaskCommentRequest
import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.MentionedAgentResponse
import com.kompanion.server.dto.TaskCommentResponse
import com.kompanion.server.dto.UpdateTaskCommentRequest
import com.kompanion.server.entity.TaskComment
import com.kompanion.server.repository.AgentRepository
import com.kompanion.server.repository.TaskCommentRepository
import com.kompanion.server.repository.TaskRepository
import com.kompanion.server.service.NoHarnessException
import com.kompanion.server.service.OverBudgetException
import com.kompanion.server.service.RunTaskService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.time.OffsetDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/teams/{teamId}/tasks/{taskId}/comments")
class TaskCommentController(
    private val comments: TaskCommentRepository,
    private val tasks: TaskRepository,
    private val agents: AgentRepository,
    private val runTaskService: RunTaskService,
    private val jdbc: JdbcTemplate,
) {

    private val mentionPattern = Regex("@([a-z0-9-]+)")

    private fun extractMentionedSlugs(body: String): List<String> =
        mentionPattern.findAll(body).map { it.groupValues[1] }.distinct().toList()

    private fun resolveMentions(teamId: UUID, body: String): List<MentionedAgentResponse> {
        val slugs = extractMentionedSlugs(body)
        if (slugs.isEmpty()) return emptyList()
        val placeholders = slugs.joinToString(",") { "?" }
        return jdbc.query(
            """
            select r.id, r.title, r.slug from agents r
            join team_agents tr on tr.agent_id = r.id
            where tr.team_id = ? and r.slug in ($placeholders)
            """.trimIndent(),
            { rs, _ ->
                MentionedAgentResponse(
                    id = UUID.fromString(rs.getString("id")),
                    title = rs.getString("title"),
                    slug = rs.getString("slug"),
                )
            },
            *(listOf<Any>(teamId) + slugs).toTypedArray(),
        )
    }

    private fun authorTitle(agentId: UUID?): String? {
        if (agentId == null) return null
        return jdbc.query(
            "select title from agents where id = ?",
            { rs, _ -> rs.getString("title") },
            agentId,
        ).firstOrNull()
    }

    private fun toResponse(teamId: UUID, comment: TaskComment) = TaskCommentResponse(
        id = comment.id!!,
        taskId = comment.taskId,
        agentId = comment.agentId,
        authorTitle = authorTitle(comment.agentId),
        body = comment.body,
        mentionedAgents = resolveMentions(teamId, comment.body),
        createdAt = comment.createdAt,
        updatedAt = comment.updatedAt,
    )

    @GetMapping
    fun list(@PathVariable teamId: UUID, @PathVariable taskId: UUID): List<TaskCommentResponse> =
        comments.findByTaskIdOrderByCreatedAt(taskId).map { toResponse(teamId, it) }

    @PostMapping
    fun create(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @RequestBody body: CreateTaskCommentRequest,
    ): ResponseEntity<Any> {
        // Mirrors CreateTaskCommentInput's Zod `body: z.string().min(1)`.
        if (body.body.isEmpty()) {
            return ResponseEntity.badRequest().body(ErrorResponse("body must contain at least 1 character"))
        }
        // createdAt is @ReadOnlyProperty (DB default now()) — re-fetch to
        // return the fully populated row, matching `returning *`.
        val saved = comments.save(TaskComment(taskId = taskId, agentId = body.agentId, body = body.body))
        val reloaded = comments.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(teamId, reloaded))
    }

    // An Operator can correct what they wrote. Agent-authored comments are
    // the record of what a run actually reported, so they stay immutable.
    @PatchMapping("/{commentId}")
    fun update(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @PathVariable commentId: UUID,
        @RequestBody body: UpdateTaskCommentRequest,
    ): ResponseEntity<Any> {
        val comment = comments.findById(commentId).orElse(null)
            ?.takeIf { it.taskId == taskId }
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("comment not found"))

        if (comment.agentId != null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ErrorResponse("only operator comments can be edited"))
        }
        // Mirrors UpdateTaskCommentInput's Zod `body: z.string().min(1)`.
        if (body.body.isEmpty()) {
            return ResponseEntity.badRequest().body(ErrorResponse("body must contain at least 1 character"))
        }

        val saved = comments.save(comment.copy(body = body.body, updatedAt = OffsetDateTime.now()))
        return ResponseEntity.ok(toResponse(teamId, saved))
    }

    // Backfills a comment from the Task's first-ever run (whichever Agent
    // that was, not necessarily who's currently assigned) the first time
    // anyone replies via a mention — so a reader following a later exchange
    // sees what the original agent actually did, not just the latest
    // reply. Idempotent: skips if that exact summary is already posted.
    private fun ensureOriginalSummaryComment(taskId: UUID) {
        val firstRun = jdbc.query(
            """
            select agent_id, summary from task_runs
            where task_id = ? and status != 'running' and summary is not null
            order by created_at asc
            limit 1
            """.trimIndent(),
            { rs, _ -> UUID.fromString(rs.getString("agent_id")) to rs.getString("summary") },
            taskId,
        ).firstOrNull() ?: return
        val (agentId, summary) = firstRun

        val alreadyPosted = jdbc.query(
            "select 1 from task_comments where task_id = ? and agent_id = ? and body = ? limit 1",
            { _, _ -> 1 },
            taskId,
            agentId,
            summary,
        ).firstOrNull()
        if (alreadyPosted != null) return

        comments.save(TaskComment(taskId = taskId, agentId = agentId, body = summary))
    }

    // Manual trigger: an operator (or, later, an automated wake) decides a
    // mentioned agent should actually run against this task. Reuses the
    // exact same runTaskWithClaude path as the assignee's "Run with Claude"
    // button — same budget check, same harness/workspace resolution — just
    // for whichever agent is named here instead of the task's current
    // assignee. The run's outcome is posted back as a new comment authored
    // by that agent, so the thread reads as a real reply.
    @PostMapping("/{commentId}/reply-as/{agentId}")
    fun replyAs(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @PathVariable commentId: UUID,
        @PathVariable agentId: UUID,
    ): ResponseEntity<Any> {
        val comment = comments.findById(commentId).orElse(null)
            ?.takeIf { it.taskId == taskId }
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("comment not found"))

        val task = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))

        val isAssigned = jdbc.query(
            "select 1 from team_agents where team_id = ? and agent_id = ?",
            { _, _ -> 1 },
            teamId,
            agentId,
        ).firstOrNull() != null
        val agent = agents.findById(agentId).orElse(null)
            ?.takeIf { isAssigned }
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("agent not found on this team"))

        val mentionAuthorTitle = authorTitle(comment.agentId) ?: "Operator"
        val mentionContext = "You were mentioned by $mentionAuthorTitle in a comment: \"${comment.body}\""

        ensureOriginalSummaryComment(taskId)

        val replyBody = try {
            val run = runTaskService.runTaskWithClaude(task, agent, mentionContext)
            run.summary ?: "(${run.status}, no summary returned)"
        } catch (e: NoHarnessException) {
            "Couldn't run — no harness directory found at agent's harnessPath \"${agent.harnessPath}\"."
        } catch (e: OverBudgetException) {
            "Couldn't run — the team is over its monthly budget."
        }

        val savedReply = comments.save(TaskComment(taskId = taskId, agentId = agent.id, body = replyBody))
        val reloaded = comments.findById(savedReply.id!!).orElse(savedReply)
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(teamId, reloaded))
    }
}
