package com.kompanion.server.adapter.outbound.process

import com.kompanion.server.application.port.outbound.ProbeResult
import com.kompanion.server.application.port.outbound.RuntimeProbe
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import org.springframework.stereotype.Component
import java.io.File
import java.util.concurrent.TimeUnit

// Runs `<bin> --version`, with the same binary and CLAUDE_CONFIG_DIR a real
// run would use. --version never signs in or calls a model, so this checks
// that the CLI starts and the config folder exists, not that credentials work.
@Component
class ProcessRuntimeProbe : RuntimeProbe {

    override fun probe(runtime: Runtime): ProbeResult {
        val configDir = runtime.resolvedConfigDir()
        if (configDir != null && !File(configDir).isDirectory) {
            return ProbeResult(false, "config directory \"$configDir\" does not exist")
        }
        val bin = runtime.binaryPath ?: System.getenv(envVar(runtime.kind)) ?: defaultCommand(runtime.kind)
        val builder = ProcessBuilder(bin, "--version").redirectErrorStream(true)
        if (configDir != null) builder.environment()["CLAUDE_CONFIG_DIR"] = configDir
        val process = try {
            builder.start()
        } catch (e: java.io.IOException) {
            return ProbeResult(false, "could not start \"$bin\": ${e.message}")
        }
        // Drained on its own thread while we wait: a CLI that prints more than
        // the pipe holds would otherwise block, and be killed as a false
        // timeout. Only the first MAX_OUTPUT chars are kept; the rest is read
        // and dropped so the process can finish.
        val output = StringBuilder()
        val reader = Thread {
            runCatching {
                process.inputStream.bufferedReader().use { r ->
                    val buf = CharArray(1024)
                    while (true) {
                        val n = r.read(buf)
                        if (n < 0) break
                        synchronized(output) {
                            if (output.length < MAX_OUTPUT) output.append(buf, 0, minOf(n, MAX_OUTPUT - output.length))
                        }
                    }
                }
            }
        }.apply { isDaemon = true; start() }
        try {
            process.outputStream.close()
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                return ProbeResult(false, "\"$bin --version\" did not finish within 10 seconds")
            }
            reader.join(1000)
            val first = synchronized(output) { output.toString() }.trim().lineSequence().firstOrNull().orEmpty()
            return if (process.exitValue() == 0) {
                ProbeResult(true, first.ifEmpty { "ok" })
            } else {
                ProbeResult(false, first.ifEmpty { "\"$bin --version\" exited with code ${process.exitValue()}" })
            }
        } finally {
            // Also closes the stream, which ends the reader if it is stuck.
            process.destroyForcibly()
        }
    }

    private companion object {
        const val MAX_OUTPUT = 4096
    }

    private fun envVar(kind: AgentRuntime) = when (kind) {
        AgentRuntime.claude_code -> "CLAUDE_BIN"
        AgentRuntime.opencode -> "OPENCODE_BIN"
        AgentRuntime.pi -> "PI_BIN"
    }

    private fun defaultCommand(kind: AgentRuntime) = when (kind) {
        AgentRuntime.claude_code -> "claude"
        AgentRuntime.opencode -> "opencode"
        AgentRuntime.pi -> "pi"
    }
}
