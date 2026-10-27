package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.ReconcileAbandonedRuns
import com.kompanion.server.application.port.outbound.RunStore
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

// A hard crash skips RunTaskService's cleanup, so the run row stays at
// 'running' and its task keeps running_since. Left alone, the Runs tab lists
// it forever and the task can never be run again. Both are cleared in one
// transaction so the two signals never disagree.
@Service
class ReconcileAbandonedRunsUseCase(private val runs: RunStore) : ReconcileAbandonedRuns {

    @Transactional
    override fun handle(): Int = runs.failAbandonedRuns(SUMMARY)

    companion object {
        const val SUMMARY = "server restarted while this run was in progress"
    }
}
