package com.kompanion.server.adapter.outbound.process

import com.kompanion.server.application.port.outbound.RunProcesses
import com.kompanion.server.domain.model.RunProcess
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

// Finds a run's CLI by pid and kills its whole tree. The pid alone is not
// enough: after a reboot or a long outage the OS may have handed it to an
// unrelated process, so the start time must match what was recorded.
@Component
class OsRunProcesses : RunProcesses {

    override fun stop(process: RunProcess): Boolean {
        val handle = ProcessHandle.of(process.pid).orElse(null) ?: return true
        if (!handle.isAlive) return true

        val actualStart = handle.info().startInstant().orElse(null)
        // Either side unknown: we cannot tell ours from a stranger's, so we
        // must neither kill it nor call it gone.
        if (actualStart == null || process.startedAt == null) return false
        if (!sameStart(actualStart, process.startedAt)) return true

        // Collected before the kill: once the CLI dies, its children are
        // reparented and no longer show up as its descendants.
        val tree = handle.descendants().toList() + handle
        tree.forEach { it.destroyForcibly() }
        tree.forEach { runCatching { it.onExit().get(KILL_WAIT.toMillis(), TimeUnit.MILLISECONDS) } }
        return tree.none { it.isAlive }
    }

    // The JDK reports start times at a coarser grain on some systems, so an
    // exact match would miss our own process.
    private fun sameStart(a: Instant, b: Instant): Boolean =
        Duration.between(a, b).abs() <= START_TOLERANCE

    companion object {
        private val START_TOLERANCE = Duration.ofSeconds(1)
        private val KILL_WAIT = Duration.ofSeconds(5)
    }
}
