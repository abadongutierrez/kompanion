package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.service.WorkspaceEnforcementService
import com.kompanion.server.service.WorkspaceManifest
import org.springframework.stereotype.Component
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode

// The original runtime, lifted out of RunTaskService unchanged. Everything
// here was already true before AgentRunner existed; it just lived inline.
@Component
class ClaudeCodeRunner(
    private val workspaceEnforcementService: WorkspaceEnforcementService,
) : AgentRunner {

    override val runtime = AgentRuntime.claude_code

    override fun validateHarness(harnessDir: File): String? =
        if (File(harnessDir, ".claude").exists()) null
        else "\"${harnessDir.path}\" exists but has no .claude/ config — it isn't a valid Claude Code harness"

    // Replaces any previous agent's .claude/ wholesale (so skills and
    // subagents don't accumulate across agents) but leaves everything else in
    // the workspace intact — that shared state is what makes an
    // Engineer -> QA handoff work.
    //
    // CLAUDE.md is deliberately NOT copied: it goes in via
    // --append-system-prompt instead, which works regardless of cwd and can
    // never clobber a real repository's own CLAUDE.md.
    override fun prepareWorkspace(ctx: RunContext, manifest: WorkspaceManifest) {
        ctx.cwdDir.mkdirs()
        File(ctx.cwdDir, ".claude").deleteRecursively()
        File(ctx.instanceDir, ".claude").takeIf { it.exists() }
            ?.copyRecursively(File(ctx.cwdDir, ".claude"), overwrite = true)
        workspaceEnforcementService.installCwdEnforcement(ctx.cwdDir, ctx.taskWorkspaceDir, manifest)
    }

    override fun buildCommand(ctx: RunContext): List<String> {
        val bin = System.getenv("CLAUDE_BIN") ?: "claude"
        val args = mutableListOf(bin, "-p", ctx.prompt)
        // On resume ctx.prompt is the follow-up, and the session already holds
        // everything that came before it.
        ctx.resume?.let { args += listOf("--resume", it.sessionId) }
        args += listOf(
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--dangerously-skip-permissions",
        )

        ctx.agent.model?.let { args += listOf("--model", it) }

        readSystemPrompt(ctx.instanceDir)?.let { args += listOf("--append-system-prompt", it) }

        // Subagent spend counts toward this too, and Claude Code stops
        // background subagents once it is reached. Rounded down, because
        // rounding up would authorize a cent more than the team has left.
        ctx.remainingBudgetUsd?.let {
            args += listOf("--max-budget-usd", it.setScale(2, RoundingMode.DOWN).toPlainString())
        }

        return args
    }

    @Suppress("UNCHECKED_CAST")
    private fun tokensFrom(result: Map<String, Any?>): TokenUsage {
        val usage = result["usage"] as? Map<String, Any?> ?: return TokenUsage.NONE
        fun n(key: String) = (usage[key] as? Number)?.toLong()
        return TokenUsage(
            input = n("input_tokens"),
            output = n("output_tokens"),
            cacheRead = n("cache_read_input_tokens"),
            cacheWrite = n("cache_creation_input_tokens"),
        )
    }

    private fun readSystemPrompt(instanceDir: File): String? =
        File(instanceDir, "CLAUDE.md").takeIf { it.exists() }?.readText()

    // -- Resume ----------------------------------------------------------

    override val supportsResume = true

    // The first stream-json line, system/init, names the session. On resume
    // it names the same session again: Claude Code keeps the id.
    override fun sessionIdFrom(event: Map<String, Any?>): String? =
        if (event["type"] == "system" && event["subtype"] == "init") event["session_id"] as? String else null

    // Inherited by the CLI from the server's own environment: the runner
    // sets neither variable.
    override fun sessionStore(): String =
        System.getenv("CLAUDE_CONFIG_DIR")?.takeIf { it.isNotBlank() }
            ?: File(System.getProperty("user.home"), ".claude").path

    // Sessions live at <store>/projects/<escaped cwd>/<id>.jsonl. How the cwd
    // is escaped is Claude Code's business (long paths get shortened), so any
    // project folder holding the file counts; ids are UUIDs, so a stray match
    // is not a real risk. Without this check a missing file makes the CLI
    // print "No conversation found" — but only once a process has started,
    // and only for as long as the CLI keeps that behaviour.
    override fun resumeProblem(sessionId: String, store: String): String? {
        val projects = File(store, "projects")
        val found = projects.listFiles()?.any { File(it, "$sessionId.jsonl").isFile } ?: false
        return if (found) null
        else "Claude Code session $sessionId was not found under ${projects.path} — " +
            "the session file is gone, so this run can't be resumed. Start a fresh run instead."
    }

    override fun interpret(
        ctx: RunContext,
        events: List<Map<String, Any?>>,
        exitCode: Int,
        stderr: String,
    ): Interpretation {
        val base = interpret(events, exitCode, stderr)
        val resume = ctx.resume ?: return base
        return base.copy(costUsd = base.costUsd?.let { costOfThisRun(it, resume.previousRawOutputs) })
    }

    // Measured against Claude Code: on --resume, total_cost_usd is the
    // session's running total, not this process's spend — a follow-up costing
    // $0.0015 on a session that had cost $0.0020 reported $0.0035. Stored as
    // is, the earlier turns would count toward the budget twice. The previous
    // run's raw result holds the total as of its end, so the difference is
    // what this run spent. The highest total any earlier run of the session
    // reported is the baseline, not just the run being resumed's: a run that
    // failed, timed out or was killed reports none, and a resume that failed
    // before loading the session reports $0 — taking either as the baseline
    // would count every turn before it again. A session's total only grows,
    // so the highest one is the latest real figure. Whatever such a run spent
    // unreported lands in this run's difference, so it too counts once. If
    // the CLI did not carry the total over (it reports less than the
    // previous total), the figure already is this run's.
    @Suppress("UNCHECKED_CAST")
    private fun costOfThisRun(reported: BigDecimal, previousRawOutputs: List<Any?>): BigDecimal {
        val previous = previousRawOutputs.mapNotNull {
            ((it as? Map<String, Any?>)?.get("total_cost_usd") as? Number)?.let { n -> BigDecimal.valueOf(n.toDouble()) }
        }.maxOrNull()
            ?: return reported
        return if (reported >= previous) reported - previous else reported
    }

    override fun interpret(
        events: List<Map<String, Any?>>,
        exitCode: Int,
        stderr: String,
    ): Interpretation {
        // The final `result` line carries the summary and the authoritative
        // total_cost_usd. Anything else is progress.
        val result = events.lastOrNull { it["type"] == "result" }
        if (result != null) {
            return Interpretation(
                ok = result["subtype"] == "success",
                // An error result carries no `result` text; its reason is in
                // `errors` (e.g. "No conversation found with session ID: …").
                summary = result["result"] as? String
                    ?: (result["errors"] as? List<*>)?.joinToString("; ")?.ifEmpty { null }
                    ?: stderr.ifEmpty { null },
                rawOutput = result,
                costUsd = (result["total_cost_usd"] as? Number)?.let { BigDecimal.valueOf(it.toDouble()) },
                tokens = tokensFrom(result),
            )
        }

        return Interpretation(
            ok = false,
            summary = stderr.ifEmpty {
                if (exitCode != 0) "claude exited with code $exitCode" else "claude ended without a result"
            },
            rawOutput = mapOf("exitCode" to exitCode, "stderr" to stderr),
            costUsd = null,
        )
    }
}
