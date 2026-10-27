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
// database would close the first one's live runs. Tests share the dev
// database, so they turn this off (src/test/resources/config/application.yml).
@Component
@ConditionalOnProperty("runs.reconcile-on-startup", havingValue = "true", matchIfMissing = true)
class AbandonedRunsReconciler(private val reconcile: ReconcileAbandonedRuns) {

    @PostConstruct
    fun reconcileOnStartup() {
        val closed = reconcile.handle()
        if (closed > 0) println("marked $closed abandoned run(s) as failed")
    }
}
