package com.kompanion.server.adapter.outbound.process

import com.kompanion.server.application.port.outbound.RunProcesses
import org.springframework.stereotype.Component
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

// Finds a run's processes by the TASK_ID it put in the CLI's environment.
// A pid would not do: the CLI may have died while tools it started live on,
// reparented and no longer its descendants, and a pid can be reused. The
// environment is inherited by every process the run spawns, whatever its
// parent is now.
//
// Reads /proc, so Linux only. Elsewhere nothing can be verified, and stopAll
// answers false: the task stays claimed until someone frees it by hand.
@Component
class OsRunProcesses : RunProcesses {

    private val proc = File("/proc")

    // A few rounds, not one: a process can fork between the scan and the
    // kill, and its child only shows up on the next scan.
    override fun stopAll(taskId: UUID): Boolean {
        if (!proc.isDirectory) return false
        val marker = "TASK_ID=$taskId"

        repeat(ROUNDS) {
            val found = carrying(marker)
            if (found.isEmpty()) return true
            found.forEach { it.destroyForcibly() }
            found.forEach { runCatching { it.onExit().get(KILL_WAIT_SECONDS, TimeUnit.SECONDS) } }
        }
        return carrying(marker).isEmpty()
    }

    // Live processes whose environment holds this exact entry. Skips this
    // JVM and its ancestors: the server may itself have been started from an
    // agent's run, and must not kill itself or the shell that launched it.
    private fun carrying(marker: String): List<ProcessHandle> {
        val self = ProcessHandle.current()
        val spared = generateSequence(self) { it.parent().orElse(null) }.map { it.pid() }.toSet()
        val pids = proc.listFiles().orEmpty().mapNotNull { it.name.toLongOrNull() }
        return pids
            .filter { it !in spared && environment(it).contains(marker) }
            .mapNotNull { ProcessHandle.of(it).orElse(null) }
            .filter { it.isAlive }
    }

    // NUL-separated KEY=value entries. Unreadable means the process is gone
    // or belongs to another user — not one of ours either way.
    private fun environment(pid: Long): List<String> =
        runCatching { File(proc, "$pid/environ").readText().split('\u0000') }.getOrDefault(emptyList())

    companion object {
        private const val ROUNDS = 3
        private const val KILL_WAIT_SECONDS = 5L
    }
}
