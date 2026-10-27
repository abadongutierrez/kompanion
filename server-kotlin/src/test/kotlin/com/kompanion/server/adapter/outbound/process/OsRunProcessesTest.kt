package com.kompanion.server.adapter.outbound.process

import com.kompanion.server.domain.model.RunProcess
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.TimeUnit

// Real processes: a shell that starts a child, standing in for a CLI and the
// tools it spawns.
class OsRunProcessesTest {

    private val stops = OsRunProcesses()
    private val started = mutableListOf<Process>()

    @AfterEach
    fun cleanUp() {
        started.forEach { p ->
            p.descendants().forEach { it.destroyForcibly() }
            p.destroyForcibly()
        }
    }

    private fun cli(): Process =
        ProcessBuilder("sh", "-c", "sleep 60 & wait").start().also { started += it }

    private fun recorded(p: Process) = RunProcess(p.pid(), p.info().startInstant().orElseThrow())

    @Test
    fun `our process and its children are killed`() {
        val p = cli()
        // Give sh a moment to fork its child.
        repeat(50) { if (p.descendants().count() == 0L) Thread.sleep(20) }
        val children = p.descendants().toList()

        assertTrue(stops.stop(recorded(p)))

        assertTrue(p.waitFor(5, TimeUnit.SECONDS))
        assertTrue(children.isNotEmpty() && children.none { it.isAlive })
    }

    @Test
    fun `a pid now held by another process is left alone`() {
        val p = cli()
        val reused = RunProcess(p.pid(), p.info().startInstant().orElseThrow().minusSeconds(3600))

        assertTrue(stops.stop(reused))

        assertTrue(p.isAlive)
    }

    @Test
    fun `a live pid with no recorded start time cannot be verified`() {
        val p = cli()

        assertFalse(stops.stop(RunProcess(p.pid(), null)))

        assertTrue(p.isAlive)
    }

    @Test
    fun `a process that is already gone counts as stopped`() {
        val p = cli()
        val gone = recorded(p)
        p.destroyForcibly().waitFor()

        assertTrue(stops.stop(gone))
    }
}
