package com.sdlcpaperclip.server.controller

import com.sdlcpaperclip.server.dto.CreateTaskCommentRequest
import com.sdlcpaperclip.server.dto.ErrorResponse
import com.sdlcpaperclip.server.dto.MentionedRoleResponse
import com.sdlcpaperclip.server.dto.TaskCommentResponse
import com.sdlcpaperclip.server.entity.TaskComment
import com.sdlcpaperclip.server.repository.RoleRepository
import com.sdlcpaperclip.server.repository.TaskCommentRepository
import com.sdlcpaperclip.server.repository.TaskRepository
import com.sdlcpaperclip.server.service.NoHarnessException
import com.sdlcpaperclip.server.service.OverBudgetException
import com.sdlcpaperclip.server.service.RunTaskService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/teams/{teamId}/tasks/{taskId}/comments")
class TaskCommentController(
    private val comments: TaskCommentRepository,
    private val tasks: TaskRepository,
    private val roles: RoleRepository,
    private val runTaskService: RunTaskService,
    private val jdbc: JdbcTemplate,
) {

    private val mentionPattern = Regex("@([a-z0-9-]+)")

    private fun extractMentionedSlugs(body: String): List<String> =
        mentionPattern.findAll(body).map { it.groupValues[1] }.distinct().toList()

    private fun resolveMentions(teamId: UUID, body: String): List<MentionedRoleResponse> {
        val slugs = extractMentionedSlugs(body)
        if (slugs.isEmpty()) return emptyList()
        val placeholders = slugs.joinToString(",") { "?" }
        return jdbc.query(
            "select id, title, slug from roles where team_id = ? and slug in ($placeholders)",
            { rs, _ ->
                MentionedRoleResponse(
                    id = UUID.fromString(rs.getString("id")),
                    title = rs.getString("title"),
                    slug = rs.getString("slug"),
                )
            },
            *(listOf<Any>(teamId) + slugs).toTypedArray(),
        )
    }

    private fun authorTitle(roleId: UUID?): String? {
        if (roleId == null) return null
        return jdbc.query(
            "select title from roles where id = ?",
            { rs, _ -> rs.getString("title") },
            roleId,
        ).firstOrNull()
    }

    private fun toResponse(teamId: UUID, comment: TaskComment) = TaskCommentResponse(
        id = comment.id!!,
        taskId = comment.taskId,
        roleId = comment.roleId,
        authorTitle = authorTitle(comment.roleId),
        body = comment.body,
        mentionedRoles = resolveMentions(teamId, comment.body),
        createdAt = comment.createdAt,
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
        val saved = comments.save(TaskComment(taskId = taskId, roleId = body.roleId, body = body.body))
        val reloaded = comments.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(teamId, reloaded))
    }

    // Backfills a comment from the Task's first-ever run (whichever Role
    // that was, not necessarily who's currently assigned) the first time
    // anyone replies via a mention — so a reader following a later exchange
    // sees what the original agent actually did, not just the latest
    // reply. Idempotent: skips if that exact summary is already posted.
    private fun ensureOriginalSummaryComment(taskId: UUID) {
        val firstRun = jdbc.query(
            """
            select role_id, summary from task_runs
            where task_id = ? and status != 'running' and summary is not null
            order by created_at asc
            limit 1
            """.trimIndent(),
            { rs, _ -> UUID.fromString(rs.getString("role_id")) to rs.getString("summary") },
            taskId,
        ).firstOrNull() ?: return
        val (roleId, summary) = firstRun

        val alreadyPosted = jdbc.query(
            "select 1 from task_comments where task_id = ? and role_id = ? and body = ? limit 1",
            { _, _ -> 1 },
            taskId,
            roleId,
            summary,
        ).firstOrNull()
        if (alreadyPosted != null) return

        comments.save(TaskComment(taskId = taskId, roleId = roleId, body = summary))
    }

    // Manual trigger: an operator (or, later, an automated wake) decides a
    // mentioned role should actually run against this task. Reuses the
    // exact same runTaskWithClaude path as the assignee's "Run with Claude"
    // button — same budget check, same harness/workspace resolution — just
    // for whichever role is named here instead of the task's current
    // assignee. The run's outcome is posted back as a new comment authored
    // by that role, so the thread reads as a real reply.
    @PostMapping("/{commentId}/reply-as/{roleId}")
    fun replyAs(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @PathVariable commentId: UUID,
        @PathVariable roleId: UUID,
    ): ResponseEntity<Any> {
        val comment = comments.findById(commentId).orElse(null)
            ?.takeIf { it.taskId == taskId }
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("comment not found"))

        val task = tasks.findById(taskId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("task not found"))

        val role = roles.findById(roleId).orElse(null)
            ?.takeIf { it.teamId == teamId }
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("role not found on this team"))

        val mentionAuthorTitle = authorTitle(comment.roleId) ?: "Operator"
        val mentionContext = "You were mentioned by $mentionAuthorTitle in a comment: \"${comment.body}\""

        ensureOriginalSummaryComment(taskId)

        val replyBody = try {
            val run = runTaskService.runTaskWithClaude(task, role, mentionContext)
            run.summary ?: "(${run.status}, no summary returned)"
        } catch (e: NoHarnessException) {
            "Couldn't run — no harness directory found at role's harnessPath \"${role.harnessPath}\"."
        } catch (e: OverBudgetException) {
            "Couldn't run — the team is over its monthly budget."
        }

        val savedReply = comments.save(TaskComment(taskId = taskId, roleId = role.id, body = replyBody))
        val reloaded = comments.findById(savedReply.id!!).orElse(savedReply)
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(teamId, reloaded))
    }
}
