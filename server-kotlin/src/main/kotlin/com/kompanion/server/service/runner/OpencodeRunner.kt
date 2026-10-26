package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.service.WorkspaceManifest
import org.springframework.stereotype.Component
import java.io.File
import java.math.BigDecimal

// opencode (https://opencode.ai) as a second runtime. Verified against
// 1.18.23; flags come from `opencode run --help`, event shapes from a real
// run rather than documentation.
//
// Deliberate gap, decided rather than overlooked: opencode runs get NO
// workspace enforcement. The PreToolUse hook that confines Claude Code to
// the task's folders and logs every command through exec_in_folder.py has no
// equivalent the server can install here — opencode's extension points are
// JS/TS plugins and a per-agent permission config. An opencode run is scoped
// by --dir and nothing else. See AGENTS.md.
@Component
class OpencodeRunner : AgentRunner {

    override val runtime = AgentRuntime.opencode

    private val agentName = OpencodeWorkspace.AGENT_NAME

    override fun validateHarness(harnessDir: File): String? = OpencodeWorkspace.validateHarness(harnessDir)

    // Shared with Opencode2Runner — see OpencodeWorkspace.
    override fun prepareWorkspace(ctx: RunContext, manifest: WorkspaceManifest) = OpencodeWorkspace.prepare(ctx)

    override fun buildCommand(ctx: RunContext): List<String> {
        val bin = System.getenv("OPENCODE_BIN") ?: "opencode"
        val args = mutableListOf(
            bin, "run",
            "--format", "json",
            "--dir", ctx.cwdDir.path,
            "--agent", agentName,
            // Runs are unattended: without this opencode blocks waiting for a
            // permission answer nobody is there to give.
            "--auto",
        )
        ctx.agent.model?.let { args += listOf("--model", it) }
        // opencode has no cost-cap flag (anomalyco/opencode#4559), so
        // remainingBudgetUsd can only be enforced by the pre-flight gate.
        args += ctx.prompt
        return args
    }

    override fun interpret(
        events: List<Map<String, Any?>>,
        exitCode: Int,
        stderr: String,
    ): Interpretation {
        val error = events.lastOrNull { it["type"] == "error" }
        if (error != null) {
            return Interpretation(
                ok = false,
                summary = errorMessage(error) ?: "opencode reported an error",
                rawOutput = error,
                costUsd = null,
            )
        }

        val stepFinishes = events.filter { it["type"] == "step_finish" }
        val texts = events.filter { it["type"] == "text" }.mapNotNull { part(it)?.get("text") as? String }

        if (exitCode != 0) {
            return Interpretation(
                ok = false,
                summary = stderr.ifEmpty { "opencode exited with code $exitCode" },
                rawOutput = mapOf("exitCode" to exitCode, "stderr" to stderr),
                costUsd = totalCost(stepFinishes),
            )
        }

        if (stepFinishes.isEmpty() && texts.isEmpty()) {
            return Interpretation(
                ok = false,
                summary = stderr.ifEmpty { "opencode produced no output" },
                rawOutput = mapOf("exitCode" to exitCode, "stderr" to stderr),
                costUsd = null,
            )
        }

        return Interpretation(
            ok = true,
            summary = texts.lastOrNull()?.trim(),
            rawOutput = mapOf(
                "steps" to stepFinishes.size,
                "tokens" to stepFinishes.mapNotNull { part(it)?.get("tokens") },
            ),
            costUsd = totalCost(stepFinishes),
            tokens = totalTokens(stepFinishes),
        )
    }

    // opencode reports per step, so these add up across the run. Its cache
    // counts are nested one level deeper than Claude's.
    @Suppress("UNCHECKED_CAST")
    private fun totalTokens(stepFinishes: List<Map<String, Any?>>): TokenUsage {
        if (stepFinishes.isEmpty()) return TokenUsage.NONE
        var input = 0L; var output = 0L; var read = 0L; var write = 0L; var seen = false
        for (step in stepFinishes) {
            val tokens = part(step)?.get("tokens") as? Map<String, Any?> ?: continue
            seen = true
            input += (tokens["input"] as? Number)?.toLong() ?: 0L
            output += (tokens["output"] as? Number)?.toLong() ?: 0L
            val cache = tokens["cache"] as? Map<String, Any?>
            read += (cache?.get("read") as? Number)?.toLong() ?: 0L
            write += (cache?.get("write") as? Number)?.toLong() ?: 0L
        }
        return if (seen) TokenUsage(input, output, read, write) else TokenUsage.NONE
    }

    // Summed across steps, and reported exactly as opencode states it. Zero
    // is a real answer here, not a missing one — a local Ollama model costs
    // nothing — so this deliberately does not substitute a token-priced
    // estimate, which would invent a charge that was never incurred. Null
    // (no step_finish at all, which happens when the CLI exits early) stays
    // null, and the UI renders that as "cost unknown".
    private fun totalCost(stepFinishes: List<Map<String, Any?>>): BigDecimal? {
        if (stepFinishes.isEmpty()) return null
        val costs = stepFinishes.mapNotNull { part(it)?.get("cost") as? Number }
        if (costs.isEmpty()) return null
        return costs.fold(BigDecimal.ZERO) { acc, n -> acc + BigDecimal.valueOf(n.toDouble()) }
    }

    @Suppress("UNCHECKED_CAST")
    private fun part(event: Map<String, Any?>): Map<String, Any?>? =
        event["part"] as? Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun errorMessage(event: Map<String, Any?>): String? {
        val error = event["error"] as? Map<String, Any?> ?: return null
        val data = error["data"] as? Map<String, Any?>
        val message = data?.get("message") as? String
        val name = error["name"] as? String
        return listOfNotNull(name, message).joinToString(": ").ifEmpty { null }
    }
}
