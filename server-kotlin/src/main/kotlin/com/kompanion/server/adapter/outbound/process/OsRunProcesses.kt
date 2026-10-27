package com.kompanion.server.adapter.outbound.process

import com.kompanion.server.application.port.outbound.RunProcesses
import org.springframework.stereotype.Component
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

// Finds a run's processes by the TASK_ID it put in the CLI's environment.
// A pid would not do: the CLI may have died while tools it started live on,
// reparented and no longer its descendants, and a pid can be reused. The
// environment is inherited by every process the run spawns, whatever its
// parent is now.
//
// Unless a tool clears it, as env -i does. Such a tool still works in the
// run's folders, so a process with no marker whose working directory is in
// one of them may be the run's too. It is not killed, since it may as well
// be a shell the user opened there, but it keeps the task claimed. A tool
// that clears its environment and leaves the run's folders is not found.
//
// Reads /proc, so Linux only. Elsewhere nothing can be verified, and stopAll
// answers false: the task stays claimed until someone frees it by hand.
@Component
class OsRunProcesses : RunProcesses {

    private val proc = File("/proc")

    // A few rounds, not one: a process can fork between the scan and the
    // kill, and its child only shows up on the next scan.
    override fun stopAll(taskId: UUID, since: Instant, folders: List<String>): Boolean {
        if (!proc.isDirectory) return false
        val marker = "TASK_ID=$taskId"
        val roots = folders.map { File(it).canonicalFile.toPath() }

        repeat(ROUNDS) {
            val scan = scan(marker, since, roots)
            if (scan.blocked) return false
            if (scan.found.isEmpty()) return true
            scan.found.forEach { it.destroyForcibly() }
            scan.found.forEach { runCatching { it.onExit().get(KILL_WAIT_SECONDS, TimeUnit.SECONDS) } }
        }
        return scan(marker, since, roots).let { !it.blocked && it.found.isEmpty() }
    }

    // found: live processes whose environment holds this exact entry, safe to
    // kill. blocked: one may belong to the run but must not or cannot be
    // killed, so the task has to stay claimed:
    // - this JVM or an ancestor carries the marker. The server may have been
    //   started from inside an agent's run; it must not kill itself or the
    //   shell that launched it, and that agent is still alive.
    // - a process of our own user, started since the run began, hides its
    //   environment (it can, by making itself non-dumpable), so we cannot
    //   tell whether it is the run's. One started earlier cannot be — that
    //   spares the ssh-agent and gpg-agent of the login session.
    // - a process started since the run began, with no marker, works in one
    //   of the run's folders.
    private class Scan(val found: List<ProcessHandle>, val blocked: Boolean)

    private fun scan(marker: String, since: Instant, roots: List<Path>): Scan {
        val spared = generateSequence(ProcessHandle.current()) { it.parent().orElse(null) }.map { it.pid() }.toSet()
        val ourUid = uid(ProcessHandle.current().pid())
        val found = mutableListOf<ProcessHandle>()
        var blocked = false
        for (pid in proc.listFiles().orEmpty().mapNotNull { it.name.toLongOrNull() }) {
            val env = environment(pid)
            val carries = when {
                env != null -> marker in env
                // Unreadable: gone by now, or another user's — not ours,
                // since children keep their parent's user. Otherwise unknown.
                uid(pid) == ourUid && couldBeTheRuns(pid, since) -> {
                    blocked = true
                    false
                }
                else -> false
            }
            if (!carries) {
                if (env != null && worksIn(pid, roots) && couldBeTheRuns(pid, since)) blocked = true
                continue
            }
            if (pid in spared) {
                blocked = true
                continue
            }
            ProcessHandle.of(pid).orElse(null)?.takeIf { it.isAlive }?.let(found::add)
        }
        return Scan(found, blocked)
    }

    // NUL-separated KEY=value entries, or null when the file cannot be read.
    private fun environment(pid: Long): List<String>? =
        runCatching { File(proc, "$pid/environ").readText().split('\u0000') }.getOrNull()

    // Whether its working directory is in one of these folders.
    private fun worksIn(pid: Long, roots: List<Path>): Boolean {
        val cwd = runCatching { Files.readSymbolicLink(proc.toPath().resolve("$pid/cwd")) }.getOrNull() ?: return false
        return roots.any(cwd::startsWith)
    }

    // The real uid, from the status file. Not the owner of /proc/<pid>: for a
    // non-dumpable process that shows as root. Null once the process is gone.
    private fun uid(pid: Long): String? =
        runCatching {
            File(proc, "$pid/status").readLines().first { it.startsWith("Uid:") }.split(Regex("\\s+"))[1]
        }.getOrNull()

    // Alive, and not known to have started before the run did.
    private fun couldBeTheRuns(pid: Long, since: Instant): Boolean {
        val handle = ProcessHandle.of(pid).orElse(null)?.takeIf { it.isAlive } ?: return false
        val started = handle.info().startInstant().orElse(null) ?: return true
        return !started.isBefore(since.minus(START_SLACK))
    }

    companion object {
        private const val ROUNDS = 3
        private const val KILL_WAIT_SECONDS = 5L

        // Start times are coarse, and the run row is written by a different
        // clock read than the one that stamps the process.
        private val START_SLACK = Duration.ofSeconds(5)
    }
}
