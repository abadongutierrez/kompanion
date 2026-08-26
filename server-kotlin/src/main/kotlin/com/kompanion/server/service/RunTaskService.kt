package com.kompanion.server.service

import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import com.kompanion.server.dto.TaskRunResponse
import com.kompanion.server.entity.Repository
import com.kompanion.server.entity.Agent
import com.kompanion.server.entity.Task
import com.kompanion.server.entity.TaskStatus
import com.kompanion.server.entity.isValidTaskTransition
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.io.File
import java.math.BigDecimal
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

class NoHarnessException : RuntimeException("no harness for this agent")
class OverBudgetException(val run: TaskRunResponse) : RuntimeException("team is over its monthly budget")
class TaskAlreadyRunningException : RuntimeException("task is already running")

private data class ClaudeResult(
    val ok: Boolean,
    val summary: String?,
    val rawOutput: Any?,
    val costUsd: BigDecimal?,
    val durationMs: Int,
)

// Direct port of runTask.ts's runTaskWithClaude — the core orchestrator,
// called from TaskController's /run, TaskCommentController's reply-as, and
// HeartbeatService.
@Service
class RunTaskService(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    private val claudeHarnessService: ClaudeHarnessService,
    private val budgetService: BudgetService,
    private val repoWorkspaceService: RepoWorkspaceService,
    private val workspaceEnforcementService: WorkspaceEnforcementService,
    private val runEventsBus: RunEventsBus,
    // 180s was set back when a run worked in a throwaway scratch directory
    // and produced a markdown file. Real work in a real worktree — read the
    // repo, edit, run the tests, commit — routinely runs longer, and the
    // kill lands mid-edit: the task goes to blocked and whatever the agent
    // had done stays uncommitted in its worktree. 30 minutes is a backstop
    // for a genuinely stuck run, not a work budget; spend is bounded by the
    // team budget instead (see BudgetService).
    @Value("\${claude.run-timeout-ms:1800000}") private val runTimeoutMs: Long,
) {

    private fun buildPrompt(
        task: Task,
        manifest: WorkspaceManifest,
        teamSnapshot: String?,
        mentionContext: String?,
    ): String {
        val workspaceLine = if (manifest.primary.repositoryLocalPath != null) {
            if (manifest.otherRepos.isNotEmpty()) {
                val otherCount = manifest.otherRepos.size
                val otherDesc = manifest.otherRepos.joinToString(", ") { "${it.name} (${it.workspaceLocalPath})" }
                "Workspace: this directory is a real git repository ('${manifest.primary.name}', branch ${manifest.branchName}) — " +
                    "implement/verify/refine as real code, right here, and commit your changes with a clear message. " +
                    "$otherCount other linked repositor${if (otherCount == 1) "y is" else "ies are"} also on the same branch, " +
                    "at these absolute paths — pass that path as --folder to exec_in_folder.py if the change touches them too, and commit separately in each: " +
                    "$otherDesc. A manifest.json in this directory also records these paths and the branch name if you need to double-check."
            } else {
                "Workspace: this directory is a real git repository (branch ${manifest.branchName}) — implement/verify/refine as real code, " +
                    "right here, and commit your changes with a clear message. A manifest.json in this directory records the branch name " +
                    "and repo path if you need to double-check."
            }
        } else {
            "Workspace: scratch (no repository linked) — use the solution.md/notes.md convention from your skill."
        }

        val lines = listOfNotNull(
            "Task ID: ${task.id}",
            "Task: ${task.title}",
            "Type: ${task.type}",
            task.description?.let { "Description: $it" },
            task.acceptanceCriteria?.let { "Acceptance criteria: $it" },
            workspaceLine,
            teamSnapshot,
            mentionContext,
        )
        return lines.joinToString("\n")
    }

    // Every other Agent only ever sees the one Task it was handed. Project
    // Manager (identified by slug, the only stable identifier an Agent has)
    // is structurally different — capacity/parallelization reasoning
    // requires seeing the whole team at once — so this is the one place a
    // team-wide query crosses into a single Task's prompt.
    private fun buildTeamSnapshot(teamId: UUID): String {
        val agents = jdbc.query(
            """
            select r.id, r.title from agents r
            join team_agents tr on tr.agent_id = r.id
            where tr.team_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("id") to rs.getString("title") },
            teamId,
        )
        val activeCounts = jdbc.query(
            """
            select agent_id, count(*)::int as active_count
            from tasks
            where team_id = ? and status = 'in_progress' and agent_id is not null
            group by agent_id
            """.trimIndent(),
            { rs, _ -> rs.getString("agent_id") to rs.getInt("active_count") },
            teamId,
        ).toMap()

        val agentLines = agents.map { (id, title) ->
            val count = activeCounts[id] ?: 0
            "- $title: $count active task${if (count == 1) "" else "s"}"
        }

        data class TaskRow(
            val title: String,
            val type: String,
            val status: String,
            val agentTitle: String?,
            val blockerTitle: String?,
        )

        val tasks = jdbc.query(
            """
            select
              t.title, t.type, t.status,
              r.title as agent_title,
              blocker.title as blocker_title
            from tasks t
            left join agents r on r.id = t.agent_id
            left join task_dependencies dep on dep.task_id = t.id and dep.type = 'blocked_by'
            left join tasks blocker on blocker.id = dep.related_task_id
            where t.team_id = ?
            order by t.created_at
            """.trimIndent(),
            { rs, _ ->
                TaskRow(
                    rs.getString("title"),
                    rs.getString("type"),
                    rs.getString("status"),
                    rs.getString("agent_title"),
                    rs.getString("blocker_title"),
                )
            },
            teamId,
        )

        val taskLines = tasks.map { t ->
            val agentLabel = t.agentTitle ?: "Unassigned"
            val blockerLabel = t.blockerTitle?.let { "\"$it\"" } ?: "none"
            "- [${t.status}] \"${t.title}\" (${t.type}) — $agentLabel — blocked by: $blockerLabel"
        }

        return (
            listOf("Team snapshot:", "Agents:") +
                agentLines.ifEmpty { listOf("(none)") } +
                listOf("Tasks:") +
                taskLines.ifEmpty { listOf("(none)") }
            ).joinToString("\n")
    }

    // Materializes the assigned agent's .claude/ (skills/agents/hook
    // settings) into the task's workspace, replacing any previous agent's
    // config wholesale (so skills/agents don't accumulate across agents) but
    // leaving everything else intact. CLAUDE.md is deliberately NOT copied
    // here (see readAgentSystemPrompt) — could clobber a real repo's own
    // CLAUDE.md otherwise.
    private fun copyHarnessSkills(workspaceDir: File, harnessDir: File) {
        workspaceDir.mkdirs()
        File(workspaceDir, ".claude").deleteRecursively()
        File(harnessDir, ".claude").copyRecursively(File(workspaceDir, ".claude"), overwrite = true)
    }

    // Read once and passed via --append-system-prompt instead of being
    // copied as a file — works identically regardless of what cwd is, and
    // can never clobber a real project's own CLAUDE.md.
    private fun readAgentSystemPrompt(harnessDir: File): String? {
        val claudeMd = File(harnessDir, "CLAUDE.md")
        return if (claudeMd.exists()) claudeMd.readText() else null
    }

    // Claude Code's --output-format json/stream-json result line includes
    // total_cost_usd at the top level.
    private fun extractCostUsd(rawOutput: Map<String, Any?>): BigDecimal? =
        (rawOutput["total_cost_usd"] as? Number)?.let { BigDecimal.valueOf(it.toDouble()) }

    // Streams `claude --output-format stream-json --include-partial-messages`:
    // every complete JSON line is persisted to task_run_events (for replay)
    // and published live to any open SSE connections as it arrives. The
    // final `result`-type line carries cost/summary.
    private fun runClaudeStreaming(
        prompt: String,
        cwd: File,
        runId: UUID,
        systemPromptAppend: String?,
        taskWorkspaceDir: File,
        taskId: UUID,
    ): ClaudeResult {
        val bin = System.getenv("CLAUDE_BIN") ?: "claude"
        val started = System.currentTimeMillis()
        val args = mutableListOf(
            bin, "-p", prompt,
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--dangerously-skip-permissions",
        )
        if (systemPromptAppend != null) {
            args.add("--append-system-prompt")
            args.add(systemPromptAppend)
        }

        val processBuilder = ProcessBuilder(args).directory(cwd)
        // The prompt goes in via -p, so the CLI has no reason to read stdin
        // — but without this it inherits the JVM's, waits ~3s on a pipe
        // nobody ever writes to, warns "no stdin data received in 3s", and
        // the run dies before Claude does any work (task -> blocked, no
        // cost recorded). Point it at /dev/null so the read returns EOF
        // immediately.
        processBuilder.redirectInput(File("/dev/null"))
        // TASK_WORKSPACE_DIR is where the harness's own Stop hook writes
        // activity.log and where the PreToolUse enforcement hook reads
        // manifest.json from — deliberately separate from cwd (the real
        // repo being worked on) once repos are linked.
        processBuilder.environment()["TASK_WORKSPACE_DIR"] = taskWorkspaceDir.path
        processBuilder.environment()["TASK_ID"] = taskId.toString()

        val process = try {
            processBuilder.start()
        } catch (e: Exception) {
            return ClaudeResult(
                ok = false,
                summary = "Failed to launch Claude Code: ${e.message}",
                rawOutput = mapOf("error" to e.message),
                costUsd = null,
                durationMs = (System.currentTimeMillis() - started).toInt(),
            )
        }

        val killer = Thread {
            try {
                Thread.sleep(runTimeoutMs)
                if (process.isAlive) process.destroyForcibly()
            } catch (e: InterruptedException) {
                // cancelled normally once the process finished on its own
            }
        }
        killer.isDaemon = true
        killer.start()

        val stderrBuilder = StringBuilder()
        val stderrThread = Thread {
            process.errorStream.bufferedReader().forEachLine { stderrBuilder.appendLine(it) }
        }
        stderrThread.isDaemon = true
        stderrThread.start()

        var seq = 0
        var finalResult: Map<String, Any?>? = null

        process.inputStream.bufferedReader().forEachLine { line ->
            val trimmed = line.trim()
            if (trimmed.isEmpty()) return@forEachLine
            val parsed: Map<String, Any?> = try {
                objectMapper.readValue(trimmed)
            } catch (e: Exception) {
                return@forEachLine // stray non-JSON stdout noise
            }
            val currentSeq = seq++
            // Stored as the original raw JSON text (not re-serialized) so
            // it's never touched by any JSON transform.
            jdbc.update(
                "insert into task_run_events (run_id, seq, payload) values (?, ?, ?)",
                runId, currentSeq, trimmed,
            )
            runEventsBus.publishEvent(runId, currentSeq, trimmed)
            if (parsed["type"] == "result") {
                finalResult = parsed
            }
        }

        val exitCode = process.waitFor()
        killer.interrupt()
        stderrThread.join(1_000)
        val durationMs = (System.currentTimeMillis() - started).toInt()

        val result = finalResult
        if (result != null) {
            return ClaudeResult(
                ok = result["subtype"] == "success",
                summary = result["result"] as? String,
                rawOutput = result,
                costUsd = extractCostUsd(result),
                durationMs = durationMs,
            )
        }

        val stderr = stderrBuilder.toString().trim()
        return ClaudeResult(
            ok = false,
            summary = stderr.ifEmpty {
                if (exitCode != 0) "claude exited with code $exitCode" else "claude ended without a result"
            },
            rawOutput = mapOf("exitCode" to exitCode, "stderr" to stderr),
            costUsd = null,
            durationMs = durationMs,
        )
    }

    private fun transitionTaskStatus(taskId: UUID, from: TaskStatus, to: TaskStatus): TaskStatus {
        if (!isValidTaskTransition(from, to)) return from
        jdbc.update("update tasks set status = ?, updated_at = now() where id = ?", to.name, taskId)
        return to
    }

    private fun mapRepository(rs: ResultSet): Repository = Repository(
        id = UUID.fromString(rs.getString("id")),
        projectId = UUID.fromString(rs.getString("project_id")),
        name = rs.getString("name"),
        localPath = rs.getString("local_path"),
        defaultBranch = rs.getString("default_branch"),
        gitUrl = rs.getString("git_url"),
        createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
    )

    private fun mapTaskRun(rs: ResultSet, agentTitle: String?): TaskRunResponse {
        val rawOutputText = rs.getString("raw_output")
        val rawOutput = rawOutputText?.let { objectMapper.readValue<Any>(it) }
        return TaskRunResponse(
            id = UUID.fromString(rs.getString("id")),
            taskId = UUID.fromString(rs.getString("task_id")),
            agentId = UUID.fromString(rs.getString("agent_id")),
            agentTitle = agentTitle,
            status = rs.getString("status"),
            summary = rs.getString("summary"),
            rawOutput = rawOutput,
            costUsd = rs.getBigDecimal("cost_usd"),
            durationMs = rs.getObject("duration_ms") as Int?,
            createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
        )
    }

    private fun insertOverBudgetRun(taskId: UUID, agent: Agent, summary: String): TaskRunResponse =
        jdbc.query(
            """
            insert into task_runs (task_id, agent_id, status, summary, cost_usd, duration_ms)
            values (?, ?, 'over_budget', ?, 0, 0)
            returning *
            """.trimIndent(),
            // `returning *` can't join, so the title comes from the Agent the
            // caller already has rather than a second round trip.
            { rs, _ -> mapTaskRun(rs, agent.title) },
            taskId, agent.id, summary,
        ).first()

    private fun insertRunningRun(taskId: UUID, agentId: UUID): UUID =
        jdbc.query(
            "insert into task_runs (task_id, agent_id, status) values (?, ?, 'running') returning id",
            { rs, _ -> UUID.fromString(rs.getString("id")) },
            taskId, agentId,
        ).first()

    private fun updateRunToTerminal(
        runId: UUID,
        status: String,
        summary: String?,
        rawOutput: Any?,
        costUsd: BigDecimal?,
        durationMs: Int?,
        agentTitle: String?,
    ): TaskRunResponse {
        val rawOutputJson = rawOutput?.let { objectMapper.writeValueAsString(it) }
        return jdbc.query(
            """
            update task_runs
            set status = ?, summary = ?, raw_output = ?::jsonb, cost_usd = ?, duration_ms = ?
            where id = ?
            returning *
            """.trimIndent(),
            { rs, _ -> mapTaskRun(rs, agentTitle) },
            status, summary, rawOutputJson, costUsd, durationMs, runId,
        ).first()
    }

    // A run row must never be left stuck at "running" forever, whatever
    // stage the failure happened at.
    private fun markRunFailed(runId: UUID, message: String) {
        jdbc.update("update task_runs set status = 'failed', summary = ? where id = ?", message, runId)
    }

    // Left join so a run whose Agent was deleted from the library still
    // lists — it just has no name, the same way a comment with no author
    // renders as "Operator".
    fun listRuns(taskId: UUID): List<TaskRunResponse> = jdbc.query(
        """
        select tr.*, a.title as agent_title
        from task_runs tr
        left join agents a on a.id = tr.agent_id
        where tr.task_id = ?
        order by tr.created_at desc
        """.trimIndent(),
        { rs, _ -> mapTaskRun(rs, rs.getString("agent_title")) },
        taskId,
    )

    fun runTaskWithClaude(task: Task, agent: Agent, mentionContext: String? = null): TaskRunResponse {
        val taskId = task.id!!
        val agentId = agent.id!!
        val harnessDir = claudeHarnessService.resolveHarnessDir(agent) ?: throw NoHarnessException()

        // Checked before spending anything: once a team is over its monthly
        // budget, refuse the run outright. Recorded as its own task_runs
        // row (status "over_budget", no cost, task status untouched) so it
        // shows up in the audit trail same as any other run outcome.
        val spend = budgetService.getTeamSpend(task.teamId)
        if (spend.monthlyBudgetUsd != null && spend.spendUsd >= spend.monthlyBudgetUsd) {
            val summary = "Team spend \$${spend.spendUsd.setScale(2, java.math.RoundingMode.HALF_UP)} has reached " +
                "its \$${spend.monthlyBudgetUsd.setScale(2, java.math.RoundingMode.HALF_UP)} monthly budget — run refused before invoking Claude."
            throw OverBudgetException(insertOverBudgetRun(taskId, agent, summary))
        }

        // running_since is the one signal any client can poll to know a run
        // is actually in flight right now, independent of `status` —
        // cleared in the finally block below. Claiming it with a conditional
        // update makes "start a run" atomic: whoever flips null -> now()
        // owns the run, and any concurrent caller (a second POST /run, a
        // mention reply) loses the race here instead of both proceeding.
        val claimed = jdbc.update(
            "update tasks set running_since = now() where id = ? and running_since is null",
            taskId,
        )
        if (claimed == 0) throw TaskAlreadyRunningException()

        // The run row is created now, at status "running", rather than only
        // at the end — task_run_events needs a run_id to attach to from the
        // very first streamed line.
        val runId = try {
            insertRunningRun(taskId, agentId)
        } catch (e: Exception) {
            // Nothing below runs, so release the claim here — a task must
            // never be left frozen by a run that never started.
            jdbc.update("update tasks set running_since = null where id = ?", taskId)
            throw e
        }
        try {
            try {
                val taskWorkspaceDir = claudeHarnessService.resolveWorkspaceDir(taskId)

                // Deterministic order so "primary" repo is stable across
                // re-runs/agent handoffs.
                val linkedRepos: List<Repository> = jdbc.query(
                    """
                    select r.* from task_repositories tr
                    join repositories r on r.id = tr.repository_id
                    where tr.task_id = ?
                    order by tr.repository_id
                    """.trimIndent(),
                    { rs, _ -> mapRepository(rs) },
                    taskId,
                )

                val manifest: WorkspaceManifest
                val workspaceDir: File

                if (linkedRepos.isNotEmpty()) {
                    val worktrees = repoWorkspaceService.ensureWorktrees(task, linkedRepos)
                    val primary = worktrees.first()
                    val others = worktrees.drop(1)
                    workspaceDir = primary.worktreeDir
                    manifest = WorkspaceManifest(
                        branchName = repoWorkspaceService.taskBranchName(task),
                        primary = ManifestRepoEntry(
                            name = primary.repo.name,
                            repositoryLocalPath = primary.repo.localPath,
                            workspaceLocalPath = primary.worktreeDir.path,
                        ),
                        otherRepos = others.map {
                            ManifestRepoEntry(it.repo.name, it.repo.localPath, it.worktreeDir.path)
                        },
                    )
                } else {
                    workspaceDir = taskWorkspaceDir
                    manifest = WorkspaceManifest(
                        branchName = null,
                        primary = ManifestRepoEntry(null, null, workspaceDir.path),
                        otherRepos = emptyList(),
                    )
                }

                copyHarnessSkills(workspaceDir, harnessDir)
                workspaceEnforcementService.installCwdEnforcement(workspaceDir, taskWorkspaceDir, manifest)
                val systemPromptAppend = readAgentSystemPrompt(harnessDir)

                // Starting a run means work is happening: move
                // backlog -> in_progress before invoking Claude.
                val startedStatus = transitionTaskStatus(taskId, task.status, TaskStatus.in_progress)

                val teamSnapshot = if (agent.slug == "project-manager") buildTeamSnapshot(task.teamId) else null
                val prompt = buildPrompt(task, manifest, teamSnapshot, mentionContext)
                val result = runClaudeStreaming(prompt, workspaceDir, runId, systemPromptAppend, taskWorkspaceDir, taskId)

                transitionTaskStatus(taskId, startedStatus, if (result.ok) TaskStatus.in_review else TaskStatus.blocked)

                if (result.ok && manifest.branchName != null && task.branchOrPrLink == null) {
                    jdbc.update("update tasks set branch_or_pr_link = ? where id = ?", manifest.branchName, taskId)
                }

                val run = updateRunToTerminal(
                    runId,
                    if (result.ok) "succeeded" else "failed",
                    result.summary,
                    result.rawOutput,
                    result.costUsd,
                    result.durationMs,
                    agent.title,
                )
                // publishEnd must only fire once the row above is already
                // terminal — otherwise a subscriber that checked status
                // right before this line could see "running" and then
                // never get an end signal.
                runEventsBus.publishEnd(runId)
                return run
            } catch (e: Exception) {
                val message = e.message ?: "run failed"
                markRunFailed(runId, message)
                runEventsBus.publishEnd(runId)
                throw e
            }
        } finally {
            jdbc.update("update tasks set running_since = null where id = ?", taskId)
        }
    }
}
