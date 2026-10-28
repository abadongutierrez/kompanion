package com.kompanion.server.adapter.inbound.startup

import com.kompanion.server.application.port.inbound.ReconcileAbandonedRuns
import jakarta.annotation.PostConstruct
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// @PostConstruct, not ApplicationReadyEvent: it runs while the context is
// still being built, so before the heartbeat is scheduled and before the web
// server takes a request — nothing can start a run ahead of the cleanup.
//
// Assumes one server per database: a second server booting against the same
// database would take the first one's live runs for abandoned ones, and kill
// their CLIs. Tests share the dev database, so they turn this off
// (src/test/resources/config/application.yml).
@Component
@ConditionalOnProperty("runs.reconcile-on-startup", havingValue = "true", matchIfMissing = true)
class AbandonedRunsReconciler(private val reconcile: ReconcileAbandonedRuns) {

    @PostConstruct
    fun reconcileOnStartup() {
        val result = reconcile.handle()
        if (result.closed > 0) println("marked ${result.closed} abandoned run(s) as failed")
        if (result.stillRunning > 0) {
            System.err.println(
                "${result.stillRunning} run(s) from before the restart may still be running and keep their task; " +
                    "stop the agent process, then restart the server to free them",
            )
        }
        result.unchecked.forEach { (taskId, reason) ->
            System.err.println("could not check the processes of task $taskId, so it stays claimed: $reason")
        }
    }
}
