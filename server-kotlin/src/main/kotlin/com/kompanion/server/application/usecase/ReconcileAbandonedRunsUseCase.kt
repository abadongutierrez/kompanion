package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.ReconcileAbandonedRuns
import com.kompanion.server.application.port.inbound.ReconcileResult
import com.kompanion.server.application.port.outbound.RunProcesses
import com.kompanion.server.application.port.outbound.RunStore
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

// A hard crash skips RunTaskService's cleanup, so the run row stays at
// 'running' and its task keeps running_since. Left alone, the Runs tab lists
// it forever and the task can never be run again.
//
// The run's timeout killer was a thread in the dead JVM, so its CLI may
// still be alive and editing the worktree. A task is only freed once that
// process is known to be gone; otherwise a new run would work in the same
// folder at the same time. A run whose process survives keeps its claim and
// stays on the Runs tab — which is accurate, since it is still running.
@Service
class ReconcileAbandonedRunsUseCase(
    private val runs: RunStore,
    private val processes: RunProcesses,
) : ReconcileAbandonedRuns {

    @Transactional
    override fun handle(): ReconcileResult {
        val abandoned = runs.abandonedRuns()
        val stopped = abandoned.filter { run -> run.process?.let(processes::stop) ?: true }
        runs.failAbandonedRuns(stopped.map { it.runId }, SUMMARY)
        return ReconcileResult(closed = stopped.size, stillRunning = abandoned.size - stopped.size)
    }

    companion object {
        const val SUMMARY = "server restarted while this run was in progress"
    }
}
