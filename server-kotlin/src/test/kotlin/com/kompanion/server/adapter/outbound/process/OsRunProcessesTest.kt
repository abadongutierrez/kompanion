package com.kompanion.server.adapter.outbound.process

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledOnOs
import org.junit.jupiter.api.condition.OS
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.time.Instant
import java.util.UUID

// Real processes carrying TASK_ID, standing in for a CLI and the tools it
// spawns. Linux only, like the adapter.
@EnabledOnOs(OS.LINUX)
class OsRunProcessesTest {

    private val stops = OsRunProcesses()
    private val taskId = UUID.randomUUID()
    private val otherTaskId = UUID.randomUUID()
    // Every process a test starts is younger than this.
    private val runStarted = Instant.now().minusSeconds(1)
    private val started = mutableListOf<Process>()
    private val orphans = mutableListOf<Long>()

    // Where the run works. The test JVM works elsewhere.
    @TempDir
    lateinit var runFolder: File
    private val folders get() = listOf(runFolder.path)

    @AfterEach
    fun cleanUp() {
        listOf(taskId, otherTaskId).forEach { stops.stopAll(it, runStarted, folders) }
        started.forEach { it.destroyForcibly() }
        orphans.forEach { pid -> ProcessHandle.of(pid).ifPresent { it.destroyForcibly() } }
    }

    private fun spawn(task: UUID?, vararg command: String): Process =
        ProcessBuilder(*command)
            .apply { if (task != null) environment()["TASK_ID"] = task.toString() }
            .start()
            .also { started += it }

    private fun carrying(task: UUID): List<Long> =
        File("/proc").listFiles().orEmpty().mapNotNull { it.name.toLongOrNull() }.filter { pid ->
            runCatching { File("/proc/$pid/environ").readText().split('\u0000') }
                .getOrDefault(emptyList())
                .contains("TASK_ID=$task")
        }

    private fun waitFor(condition: () -> Boolean) {
        repeat(100) { if (condition()) return else Thread.sleep(20) }
    }

    @Test
    fun `the CLI and its children are killed`() {
        val cli = spawn(taskId, "sh", "-c", "sleep 60 & wait")
        waitFor { carrying(taskId).size >= 2 }

        assertTrue(stops.stopAll(taskId, runStarted, folders))

        assertFalse(cli.isAlive)
        assertTrue(carrying(taskId).isEmpty())
    }

    @Test
    fun `a tool that outlived the CLI is found and killed`() {
        // The shell starts a sleep in a subshell and exits: the sleep is
        // reparented and no longer anyone's descendant we know of.
        spawn(taskId, "sh", "-c", "(sleep 60 &)").waitFor()
        waitFor { carrying(taskId).isNotEmpty() }
        assertTrue(carrying(taskId).isNotEmpty())

        assertTrue(stops.stopAll(taskId, runStarted, folders))

        assertTrue(carrying(taskId).isEmpty())
    }

    @Test
    fun `another task's processes are left alone`() {
        val other = spawn(otherTaskId, "sleep", "60")

        assertTrue(stops.stopAll(taskId, runStarted, folders))

        assertTrue(other.isAlive)
    }

    @Test
    fun `a process that hides its environment keeps the task claimed, unless it is older than the run`() {
        // PR_SET_DUMPABLE (4) = 0 makes /proc/<pid>/environ unreadable, even
        // to the same user. It carries no marker: we cannot know that.
        val hidden = spawn(
            null, "python3", "-c",
            "import ctypes, sys, time; ctypes.CDLL(None).prctl(4, 0, 0, 0, 0); print('ok', flush=True); time.sleep(60)",
        )
        hidden.inputStream.bufferedReader().readLine()

        assertFalse(stops.stopAll(taskId, runStarted, folders))
        assertTrue(hidden.isAlive)

        // A run that began after it started cannot have spawned it.
        assertTrue(stops.stopAll(taskId, Instant.now().plusSeconds(60), folders))
    }

    @Test
    fun `a tool that cleared its environment and outlived the CLI keeps the task claimed while it works in the run's folders`() {
        // env -i drops TASK_ID, and the subshell's sleep is reparented once
        // sh exits. It prints its pid so the test can clean it up: the
        // adapter does not kill it.
        val tool = ProcessBuilder("env", "-i", "sh", "-c", "(sleep 60 & echo \$!)")
            .directory(runFolder)
            .apply { environment()["TASK_ID"] = taskId.toString() }
            .start()
            .also { started += it }
        val pid = tool.inputStream.bufferedReader().readLine().trim().toLong()
        orphans += pid
        tool.waitFor()
        assertFalse(pid in carrying(taskId))

        assertFalse(stops.stopAll(taskId, runStarted, folders))
        assertTrue(ProcessHandle.of(pid).map { it.isAlive }.orElse(false))

        // Outside the run's folders, or older than the run, it cannot be the run's.
        assertTrue(stops.stopAll(taskId, runStarted, listOf(File(runFolder, "elsewhere").path)))
        assertTrue(stops.stopAll(taskId, Instant.now().plusSeconds(60), folders))
    }
}
