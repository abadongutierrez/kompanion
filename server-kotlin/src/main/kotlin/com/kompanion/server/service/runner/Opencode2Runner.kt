package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.service.WorkspaceManifest
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import java.io.File
import java.math.BigDecimal
import java.util.concurrent.TimeUnit

// opencode v2 (verified against 2.0.26). A runtime of its own rather than a
// version switch in OpencodeRunner, which stays as it is for v1. The harness
// layout and the agent file are the same, so both share OpencodeWorkspace.
//
// What changed in v2, and why the command line looks the way it does:
// - `run` has no --dir. The working folder is the process cwd, and
//   RunTaskService already starts the process in ctx.cwdDir.
// - By default v2 talks to a shared background service. --standalone gives
//   each run a private server, so a run neither depends on nor changes the
//   user's service. It still reads the same auth.json and config folder.
// - The stream never carries a step_finish for the last step, so its cost
//   and tokens are missing. afterRun reads them from `session export`
//   instead and adds them as one session_summary event.
//
// Same deliberate gap as v1: NO workspace enforcement hook (opencode's
// extension points are JS/TS plugins the server can't install as a hook),
// and no cost-cap flag, so a team budget is enforced only by the pre-flight
// gate in RunTaskService. See AGENTS.md.
@Component
class Opencode2Runner : AgentRunner {

    override val runtime = AgentRuntime.opencode2

    private val objectMapper = ObjectMapper()

    // The Runtime chosen in Settings wins, then OPENCODE2_BIN, then PATH.
    private fun bin(ctx: RunContext) = ctx.binary("OPENCODE2_BIN", "opencode2")

    override fun validateHarness(harnessDir: File): String? = OpencodeWorkspace.validateHarness(harnessDir)

    override fun prepareWorkspace(ctx: RunContext, manifest: WorkspaceManifest) = OpencodeWorkspace.prepare(ctx)

    override fun buildCommand(ctx: RunContext): List<String> {
        val args = mutableListOf(
            bin(ctx), "run",
            "--standalone",
            "--format", "json",
            // Runs are unattended: without this opencode blocks waiting for a
            // permission answer nobody is there to give.
            "--auto",
            "--agent", OpencodeWorkspace.AGENT_NAME,
        )
        ctx.agent.model?.let { args += listOf("-m", it) }
        args += ctx.prompt
        return args
    }

    override fun afterRun(ctx: RunContext, events: List<Map<String, Any?>>): List<Map<String, Any?>> {
        val sessionId = events.firstNotNullOfOrNull { it["sessionID"] as? String } ?: return emptyList()
        val exported = exportSession(bin(ctx), ctx.cwdDir, sessionId) ?: return emptyList()
        return listOfNotNull(sessionSummary(sessionId, exported))
    }

    // Best effort: a missing summary only means the run's cost falls back to
    // the step_finish events, so any failure here is swallowed.
    private fun exportSession(bin: String, cwd: File, sessionId: String): String? = try {
        val process = ProcessBuilder(bin, "session", "export", "--standalone", sessionId)
            .directory(cwd)
            .redirectInput(File("/dev/null"))
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start()
        val out = process.inputStream.bufferedReader().readText()
        if (process.waitFor(60, TimeUnit.SECONDS) && process.exitValue() == 0) out else null
    } catch (e: Exception) {
        null
    }

    // Keeps only the session's totals, not its messages: the transcript
    // already has those, and the export holds the full prompt.
    @Suppress("UNCHECKED_CAST")
    internal fun sessionSummary(sessionId: String, exportJson: String): Map<String, Any?>? {
        val parsed: Map<String, Any?> = try {
            objectMapper.readValue(exportJson)
        } catch (e: Exception) {
            return null
        }
        val info = parsed["info"] as? Map<String, Any?> ?: return null
        return mapOf(
            "type" to SESSION_SUMMARY,
            "sessionID" to sessionId,
            "cost" to info["cost"],
            "tokens" to info["tokens"],
            "outcome" to info["outcome"],
        )
    }

    override fun interpret(
        events: List<Map<String, Any?>>,
        exitCode: Int,
        stderr: String,
    ): Interpretation {
        val summary = events.lastOrNull { it["type"] == SESSION_SUMMARY }
        val stepFinishes = events.filter { it["type"] == "step_finish" }

        val error = events.lastOrNull { it["type"] == "error" }
        if (error != null) {
            return Interpretation(
                ok = false,
                summary = errorMessage(error) ?: "opencode reported an error",
                rawOutput = error,
                costUsd = cost(summary, stepFinishes),
                tokens = tokens(summary, stepFinishes),
            )
        }

        val texts = events.filter { it["type"] == "text" }.mapNotNull { part(it)?.get("text") as? String }

        if (exitCode != 0) {
            return Interpretation(
                ok = false,
                summary = stderr.ifEmpty { "opencode exited with code $exitCode" },
                rawOutput = mapOf("exitCode" to exitCode, "stderr" to stderr),
                costUsd = cost(summary, stepFinishes),
                tokens = tokens(summary, stepFinishes),
            )
        }

        if (texts.isEmpty() && stepFinishes.isEmpty()) {
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
                "sessionID" to events.firstNotNullOfOrNull { it["sessionID"] },
                "steps" to stepFinishes.size,
                "outcome" to summary?.get("outcome"),
            ),
            costUsd = cost(summary, stepFinishes),
            tokens = tokens(summary, stepFinishes),
        )
    }

    // The session summary is the whole run; the step_finish sum misses the
    // last step and is only the fallback. Zero is a real cost, not a missing
    // one, and null stays null ("cost unknown").
    private fun cost(summary: Map<String, Any?>?, stepFinishes: List<Map<String, Any?>>): BigDecimal? {
        (summary?.get("cost") as? Number)?.let { return BigDecimal.valueOf(it.toDouble()) }
        val costs = stepFinishes.mapNotNull { part(it)?.get("cost") as? Number }
        if (costs.isEmpty()) return null
        return costs.fold(BigDecimal.ZERO) { acc, n -> acc + BigDecimal.valueOf(n.toDouble()) }
    }

    @Suppress("UNCHECKED_CAST")
    private fun tokens(summary: Map<String, Any?>?, stepFinishes: List<Map<String, Any?>>): TokenUsage {
        val all = (summary?.get("tokens") as? Map<String, Any?>)?.let { listOf(it) }
            ?: stepFinishes.mapNotNull { part(it)?.get("tokens") as? Map<String, Any?> }
        if (all.isEmpty()) return TokenUsage.NONE
        var input = 0L; var output = 0L; var read = 0L; var write = 0L
        for (t in all) {
            input += (t["input"] as? Number)?.toLong() ?: 0L
            output += (t["output"] as? Number)?.toLong() ?: 0L
            val cache = t["cache"] as? Map<String, Any?>
            read += (cache?.get("read") as? Number)?.toLong() ?: 0L
            write += (cache?.get("write") as? Number)?.toLong() ?: 0L
        }
        return TokenUsage(input, output, read, write)
    }

    @Suppress("UNCHECKED_CAST")
    private fun part(event: Map<String, Any?>): Map<String, Any?>? =
        event["part"] as? Map<String, Any?>

    // v2's error is flat: {"type": "provider.auth", "message": "..."}. The
    // message is what an operator needs, so it is the summary on its own.
    @Suppress("UNCHECKED_CAST")
    private fun errorMessage(event: Map<String, Any?>): String? {
        val error = event["error"] as? Map<String, Any?> ?: return null
        return (error["message"] as? String)?.ifBlank { null } ?: (error["type"] as? String)
    }

    companion object {
        // Not an opencode event: written by afterRun from `session export`.
        const val SESSION_SUMMARY = "session_summary"
    }
}
