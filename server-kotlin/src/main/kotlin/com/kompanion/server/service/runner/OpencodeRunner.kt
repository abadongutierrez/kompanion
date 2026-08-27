package com.kompanion.server.service.runner

import com.kompanion.server.entity.AgentRuntime
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

    // The name of the agent definition written into the workspace and passed
    // to --agent. Fixed rather than derived from the Agent's slug: it names a
    // file we own inside a directory we rewrite each run, so a stable name
    // keeps prepareWorkspace idempotent.
    private val agentName = "kompanion"

    override fun validateHarness(harnessDir: File): String? =
        if (File(harnessDir, ".opencode").exists() || File(harnessDir, "AGENTS.md").exists()) null
        else "\"${harnessDir.path}\" exists but has neither .opencode/ nor AGENTS.md — it isn't a valid opencode harness"

    // opencode has no --append-system-prompt: a system prompt reaches it only
    // as an agent definition on disk, selected by --agent. So unlike the
    // Claude path — which passes CLAUDE.md as a flag precisely so it can
    // never clobber a real repository's own file — this one has to write into
    // the working directory. It goes under .opencode/agents/, which is ours,
    // rather than at AGENTS.md in the repo root, which would overwrite the
    // project's own.
    override fun prepareWorkspace(ctx: RunContext, manifest: WorkspaceManifest) {
        ctx.cwdDir.mkdirs()

        val destOpencode = File(ctx.cwdDir, ".opencode")
        destOpencode.deleteRecursively()
        File(ctx.harnessDir, ".opencode").takeIf { it.exists() }
            ?.copyRecursively(destOpencode, overwrite = true)

        val agentsDir = File(destOpencode, "agents")
        agentsDir.mkdirs()
        File(agentsDir, "$agentName.md").writeText(buildAgentDefinition(ctx))
    }

    // AGENTS.md is opencode's own convention; CLAUDE.md is the fallback so a
    // harness written for Claude Code still carries its framing across
    // without being duplicated.
    private fun buildAgentDefinition(ctx: RunContext): String {
        val body = listOf("AGENTS.md", "CLAUDE.md")
            .map { File(ctx.harnessDir, it) }
            .firstOrNull { it.exists() }
            ?.readText()
            .orEmpty()

        return buildString {
            appendLine("---")
            appendLine("description: ${ctx.agent.title}, running a Kompanion task")
            appendLine("mode: primary")
            appendLine("---")
            appendLine()
            append(body)
        }
    }

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
        )
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
