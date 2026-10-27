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
        return try {
            val builder = ProcessBuilder(bin, "--version").redirectErrorStream(true)
            if (configDir != null) builder.environment()["CLAUDE_CONFIG_DIR"] = configDir
            val process = builder.start()
            process.outputStream.close()
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                return ProbeResult(false, "\"$bin --version\" did not finish within 10 seconds")
            }
            val output = process.inputStream.bufferedReader().readText().trim().lineSequence().firstOrNull().orEmpty()
            if (process.exitValue() == 0) {
                ProbeResult(true, output.ifEmpty { "ok" })
            } else {
                ProbeResult(false, output.ifEmpty { "\"$bin --version\" exited with code ${process.exitValue()}" })
            }
        } catch (e: java.io.IOException) {
            ProbeResult(false, "could not start \"$bin\": ${e.message}")
        }
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
