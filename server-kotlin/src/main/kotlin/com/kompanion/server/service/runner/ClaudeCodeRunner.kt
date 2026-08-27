package com.kompanion.server.service.runner

import com.kompanion.server.entity.AgentRuntime
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
        File(ctx.harnessDir, ".claude").copyRecursively(File(ctx.cwdDir, ".claude"), overwrite = true)
        workspaceEnforcementService.installCwdEnforcement(ctx.cwdDir, ctx.taskWorkspaceDir, manifest)
    }

    override fun buildCommand(ctx: RunContext): List<String> {
        val bin = System.getenv("CLAUDE_BIN") ?: "claude"
        val args = mutableListOf(
            bin, "-p", ctx.prompt,
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--dangerously-skip-permissions",
        )

        ctx.agent.model?.let { args += listOf("--model", it) }

        readSystemPrompt(ctx.harnessDir)?.let { args += listOf("--append-system-prompt", it) }

        // Subagent spend counts toward this too, and Claude Code stops
        // background subagents once it is reached. Rounded down, because
        // rounding up would authorize a cent more than the team has left.
        ctx.remainingBudgetUsd?.let {
            args += listOf("--max-budget-usd", it.setScale(2, RoundingMode.DOWN).toPlainString())
        }

        return args
    }

    private fun readSystemPrompt(harnessDir: File): String? =
        File(harnessDir, "CLAUDE.md").takeIf { it.exists() }?.readText()

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
                summary = result["result"] as? String,
                rawOutput = result,
                costUsd = (result["total_cost_usd"] as? Number)?.let { BigDecimal.valueOf(it.toDouble()) },
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
