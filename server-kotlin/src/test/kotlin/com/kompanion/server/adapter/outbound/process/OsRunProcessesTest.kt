package com.kompanion.server.adapter.outbound.process

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.util.UUID

// Real processes carrying TASK_ID, standing in for a CLI and the tools it
// spawns. Linux only, like the adapter.
class OsRunProcessesTest {

    private val stops = OsRunProcesses()
    private val taskId = UUID.randomUUID()
    private val otherTaskId = UUID.randomUUID()

    @AfterEach
    fun cleanUp() {
        listOf(taskId, otherTaskId).forEach { stops.stopAll(it) }
    }

    private fun spawn(task: UUID, script: String): Process =
        ProcessBuilder("sh", "-c", script)
            .apply { environment()["TASK_ID"] = task.toString() }
            .start()

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
        val cli = spawn(taskId, "sleep 60 & wait")
        waitFor { carrying(taskId).size >= 2 }

        assertTrue(stops.stopAll(taskId))

        assertFalse(cli.isAlive)
        assertTrue(carrying(taskId).isEmpty())
    }

    @Test
    fun `a tool that outlived the CLI is found and killed`() {
        // The shell starts a sleep in a subshell and exits: the sleep is
        // reparented and no longer anyone's descendant we know of.
        spawn(taskId, "(sleep 60 &)").waitFor()
        waitFor { carrying(taskId).isNotEmpty() }
        assertTrue(carrying(taskId).isNotEmpty())

        assertTrue(stops.stopAll(taskId))

        assertTrue(carrying(taskId).isEmpty())
    }

    @Test
    fun `another task's processes are left alone`() {
        val other = spawn(otherTaskId, "sleep 60")

        assertTrue(stops.stopAll(taskId))

        assertTrue(other.isAlive)
    }
}
