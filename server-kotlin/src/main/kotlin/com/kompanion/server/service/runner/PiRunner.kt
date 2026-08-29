package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.service.WorkspaceEnforcementService
import com.kompanion.server.service.WorkspaceManifest
import org.springframework.stereotype.Component
import java.io.File
import java.math.BigDecimal

// pi (https://github.com/earendil-works/pi-mono) as a third runtime, added
// mainly to drive local models served by LM Studio. Verified against 0.84.3;
// flags come from `pi --help`, event shapes from the vendored docs/json.md and
// a real `pi -p --mode json` run.
//
// Unlike opencode, a pi run IS confined. pi's extension API has a blocking
// `tool_call` hook, so workspace/pi/enforce-workspace.ts enforces the same
// allowed-roots rule as the Claude Code PreToolUse hook and funnels every bash
// call through the same exec_in_folder.py (folder check + commands.log).
//
// And unlike both of the others, a pi run writes nothing into the working
// directory: the system prompt goes in via --append-system-prompt, the
// extension is loaded from an absolute path, and pi's own config directory is
// pointed at the task's workspace.
@Component
class PiRunner(
    private val workspaceEnforcementService: WorkspaceEnforcementService,
) : AgentRunner {

    override val runtime = AgentRuntime.pi

    // pi reads AGENTS.md/CLAUDE.md as context files and .pi/ as project
    // resources; pi-agent/ (ours, see environment()) carries the provider
    // catalogue. Any one of them makes the folder usable.
    override fun validateHarness(harnessDir: File): String? {
        val markers = listOf("AGENTS.md", "CLAUDE.md", ".pi", PI_AGENT_DIR)
        return if (markers.any { File(harnessDir, it).exists() }) null
        else "\"${harnessDir.path}\" exists but has none of ${markers.joinToString(", ")} — it isn't a valid pi harness"
    }

    // Nothing lands in cwdDir. The harness's pi config directory is copied into
    // the task workspace instead of used in place: pi writes into it (sessions,
    // model cache, trust.json) and the harness is a shared template. Wiped
    // first, for the same reason the .claude/ copy is — the previous agent's
    // config has to be replaced, not merged into.
    override fun prepareWorkspace(ctx: RunContext, manifest: WorkspaceManifest) {
        ctx.cwdDir.mkdirs()

        val harnessConfig = File(ctx.harnessDir, PI_AGENT_DIR)
        if (harnessConfig.exists()) {
            val dest = configDir(ctx)
            dest.deleteRecursively()
            harnessConfig.copyRecursively(dest, overwrite = true)

            // The enforcement extension goes into the config directory as
            // well as onto the command line, and the difference matters: a
            // -e path reaches only the process we launch. Anything that
            // spawns a child pi (pi-subagents, say) builds that child's argv
            // itself and forwards none of ours, so a child would inherit
            // discovered extensions only. Installing it here — the config
            // directory children inherit through PI_CODING_AGENT_DIR — is
            // what keeps a subagent inside the task's folders instead of
            // silently outside them.
            //
            // Copied from the same single source the -e flag points at, so
            // the two can never drift. Loading it twice is harmless: the
            // path rewrite is idempotent and the bash wrap detects itself.
            val extensions = File(dest, "extensions")
            extensions.mkdirs()
            workspaceEnforcementService.piExtensionFile
                .copyTo(File(extensions, "enforce-workspace.ts"), overwrite = true)
        }

        workspaceEnforcementService.installPiEnforcement(ctx.taskWorkspaceDir, manifest)
    }

    override fun buildCommand(ctx: RunContext): List<String> {
        val bin = System.getenv("PI_BIN") ?: "pi"
        val args = mutableListOf(
            bin,
            "-p", "--mode", "json",
            // A repository's own .pi/extensions is arbitrary code we never
            // agreed to run. Our extension is unaffected: an explicit -e path
            // loads regardless of project trust.
            "--no-approve",
            // Kept, rather than --no-session: the session JSONL is the only
            // record of a run that survives outside our own event table, and
            // it belongs in the task's folder, not in ~/.pi or the repo.
            "--session-dir", File(ctx.taskWorkspaceDir, "pi-sessions").path,
            "-e", workspaceEnforcementService.piExtensionFile.path,
        )

        ctx.agent.model?.let { args += listOf("--model", it) }

        readSystemPrompt(ctx.harnessDir)?.let { args += listOf("--append-system-prompt", it) }

        // pi discovers skills from its config dir and from the *cwd* — never
        // from the harness, which is neither. So a harness's skills only
        // reach it by absolute path, the same way its system prompt does.
        //
        // .claude/skills is included because pi implements the Agent Skills
        // standard, so a SKILL.md written for Claude Code loads unchanged and
        // the two runtimes can share one definition instead of drifting.
        for (dir in skillDirs(ctx.harnessDir)) {
            args += listOf("--skill", dir.path)
        }

        // pi has no cost-cap flag, so remainingBudgetUsd can only be enforced
        // by the pre-flight gate in RunTaskService — same gap as opencode.
        //
        // -- ends option parsing: a prompt starting with a dash is prompt text,
        // not a flag.
        args += "--"
        args += ctx.prompt
        return args
    }

    override fun environment(ctx: RunContext): Map<String, String> {
        val env = mutableMapOf(
            // Update checks and telemetry on every unattended run buy nothing
            // and can only add latency or failure.
            "PI_OFFLINE" to "1",
            // Where the extension finds the script it rewrites bash calls
            // into. Passed rather than derived from the extension's own
            // location so the two paths can move independently.
            "KOMPANION_EXEC_IN_FOLDER" to workspaceEnforcementService.execInFolderScript.path,
        )
        // Only when the harness ships one. Otherwise pi falls back to
        // ~/.pi/agent, which is where a developer's own LM Studio provider and
        // credentials already live.
        val configDir = configDir(ctx)
        if (configDir.exists()) env["PI_CODING_AGENT_DIR"] = configDir.path
        return env
    }

    // AGENTS.md first (pi's own convention), CLAUDE.md as the fallback so a
    // harness written for Claude Code carries its framing across — same order
    // OpencodeRunner uses.
    private fun readSystemPrompt(harnessDir: File): String? =
        listOf("AGENTS.md", "CLAUDE.md")
            .map { File(harnessDir, it) }
            .firstOrNull { it.exists() }
            ?.readText()

    private fun configDir(ctx: RunContext): File = File(ctx.taskWorkspaceDir, PI_AGENT_DIR)

    // Both layouts, in the order pi itself would prefer them, and only when
    // they exist — a --skill path that doesn't exist is recorded as a skill
    // diagnostic pi never surfaces in print mode, so filtering here is what
    // keeps a harness without skills from failing silently in a confusing way.
    private fun skillDirs(harnessDir: File): List<File> =
        listOf(".pi/skills", ".claude/skills")
            .map { File(harnessDir, it) }
            .filter { it.isDirectory }

    override fun interpret(
        events: List<Map<String, Any?>>,
        exitCode: Int,
        stderr: String,
    ): Interpretation {
        val assistantMessages = events
            .filter { it["type"] == "message_end" }
            .mapNotNull { message(it) }
            .filter { it["role"] == "assistant" }

        val last = assistantMessages.lastOrNull()
        val stopReason = last?.get("stopReason") as? String
        val failed = stopReason == "error" || stopReason == "aborted"
        val sawEnd = events.any { it["type"] == "agent_end" }

        if (last == null) {
            return Interpretation(
                ok = false,
                summary = stderr.ifEmpty {
                    if (exitCode != 0) "pi exited with code $exitCode" else "pi produced no output"
                },
                rawOutput = mapOf("exitCode" to exitCode, "stderr" to stderr),
                costUsd = null,
            )
        }

        val ok = exitCode == 0 && sawEnd && !failed
        val summary = if (ok) {
            textOf(last).ifEmpty { null }
        } else {
            (last["errorMessage"] as? String)
                ?: stderr.ifEmpty { "pi ended with stopReason \"$stopReason\" (exit $exitCode)" }
        }

        return Interpretation(
            ok = ok,
            summary = summary,
            rawOutput = mapOf(
                "exitCode" to exitCode,
                "stopReason" to stopReason,
                "messages" to assistantMessages.size,
            ),
            costUsd = totalCost(assistantMessages),
            tokens = totalTokens(assistantMessages),
        )
    }

    // Reported exactly as pi states it, summed over the run's assistant
    // messages. Zero is a real answer — an LM Studio model costs nothing — so
    // this deliberately doesn't fall back to a token-priced estimate, which
    // would invent a charge nobody was billed for.
    private fun totalCost(assistantMessages: List<Map<String, Any?>>): BigDecimal? {
        val costs = assistantMessages.mapNotNull { cost(it)?.get("total") as? Number }
        if (costs.isEmpty()) return null
        return costs.fold(BigDecimal.ZERO) { acc, n -> acc + BigDecimal.valueOf(n.toDouble()) }
    }

    // pi reports usage per assistant message, so these add up across the run.
    private fun totalTokens(assistantMessages: List<Map<String, Any?>>): TokenUsage {
        var input = 0L; var output = 0L; var read = 0L; var write = 0L; var seen = false
        for (message in assistantMessages) {
            val usage = usage(message) ?: continue
            seen = true
            fun n(key: String) = (usage[key] as? Number)?.toLong() ?: 0L
            input += n("input")
            output += n("output")
            read += n("cacheRead")
            write += n("cacheWrite")
        }
        return if (seen) TokenUsage(input, output, read, write) else TokenUsage.NONE
    }

    // The assistant's visible answer: every text block of the final message,
    // skipping thinking and tool calls.
    @Suppress("UNCHECKED_CAST")
    private fun textOf(message: Map<String, Any?>): String {
        val content = message["content"] as? List<*> ?: return ""
        return content
            .mapNotNull { it as? Map<String, Any?> }
            .filter { it["type"] == "text" }
            .mapNotNull { it["text"] as? String }
            .joinToString("\n")
            .trim()
    }

    @Suppress("UNCHECKED_CAST")
    private fun message(event: Map<String, Any?>): Map<String, Any?>? =
        event["message"] as? Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun usage(message: Map<String, Any?>): Map<String, Any?>? =
        message["usage"] as? Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun cost(message: Map<String, Any?>): Map<String, Any?>? =
        usage(message)?.get("cost") as? Map<String, Any?>

    private companion object {
        // pi's own agent-config directory layout (models.json, settings.json,
        // sessions/): named the same inside a harness and inside a task
        // workspace, since the second is a copy of the first.
        const val PI_AGENT_DIR = "pi-agent"
    }
}
