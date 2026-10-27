package com.kompanion.server.adapter.outbound.process

import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Runtime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class ProcessRuntimeProbeTest {

    private fun script(dir: File, body: String) = File(dir, "cli").apply {
        writeText("#!/bin/sh\n$body\n")
        setExecutable(true)
    }.path

    private fun runtime(bin: String, configDir: String? = null) =
        Runtime(name = "x", kind = AgentRuntime.claude_code, binaryPath = bin, configDir = configDir)

    @Test
    fun `it reports the first line of the version output`(@TempDir tmp: File) {
        val result = ProcessRuntimeProbe().probe(runtime(script(tmp, "echo '1.2.3 (Test)'")))

        assertTrue(result.ok)
        assertEquals("1.2.3 (Test)", result.message)
    }

    @Test
    fun `output larger than a pipe buffer does not look like a timeout`(@TempDir tmp: File) {
        val bin = script(tmp, "echo 1.0.0; head -c 300000 /dev/zero | tr '\\0' x")

        val result = ProcessRuntimeProbe().probe(runtime(bin))

        assertTrue(result.ok, result.message)
        assertEquals("1.0.0", result.message)
    }

    @Test
    fun `the config dir is handed to the cli`(@TempDir tmp: File) {
        val dir = File(tmp, "cfg").apply { mkdirs() }

        val result = ProcessRuntimeProbe().probe(runtime(script(tmp, "echo \$CLAUDE_CONFIG_DIR"), dir.path))

        assertEquals(dir.path, result.message)
    }

    @Test
    fun `a missing config dir or binary is a failure`(@TempDir tmp: File) {
        assertFalse(ProcessRuntimeProbe().probe(runtime("/bin/true", File(tmp, "nope").path)).ok)
        assertFalse(ProcessRuntimeProbe().probe(runtime(File(tmp, "nope").path)).ok)
    }
}
