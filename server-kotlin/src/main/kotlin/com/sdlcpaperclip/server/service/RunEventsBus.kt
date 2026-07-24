package com.sdlcpaperclip.server.service

import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// In-process fan-out from a run's streaming Claude invocation to any open
// SSE connections watching it. A single map is sufficient because this
// server runs as one JVM process — no external pub/sub needed.
//
// Events carry their `seq` so a client that queried persisted history and
// then subscribed can dedupe anything published in the (tiny) gap between
// those two steps, rather than double-apply a delta.
@Component
class RunEventsBus {
    private val listenersByRun = ConcurrentHashMap<UUID, MutableSet<(Int, String) -> Unit>>()
    private val endListenersByRun = ConcurrentHashMap<UUID, MutableSet<() -> Unit>>()

    // A listener is an SSE connection's write callback — Spring's
    // SseEmitter.send() throws synchronously on a broken pipe (unlike
    // Node's fire-and-forget res.write()), so without this guard a dead
    // client connection would blow up the run's own streaming loop instead
    // of just that one dead subscriber.
    fun publishEvent(runId: UUID, seq: Int, payload: String) {
        listenersByRun[runId]?.forEach {
            try {
                it(seq, payload)
            } catch (e: Exception) {
                // subscriber is gone; the run itself must not be affected.
            }
        }
    }

    // Callers must only publish this once the run's task_runs row is already
    // in its terminal state (status != "running") — a subscriber that checks
    // status and then subscribes must never observe "running" followed by
    // silence forever because the end signal already fired before the DB
    // write landed.
    fun publishEnd(runId: UUID) {
        endListenersByRun[runId]?.forEach { it() }
        listenersByRun.remove(runId)
        endListenersByRun.remove(runId)
    }

    fun subscribe(runId: UUID, onEvent: (Int, String) -> Unit, onEnd: () -> Unit): () -> Unit {
        val listeners = listenersByRun.computeIfAbsent(runId) { ConcurrentHashMap.newKeySet() }
        listeners.add(onEvent)
        val endListeners = endListenersByRun.computeIfAbsent(runId) { ConcurrentHashMap.newKeySet() }
        endListeners.add(onEnd)

        return {
            listenersByRun[runId]?.remove(onEvent)
            endListenersByRun[runId]?.remove(onEnd)
        }
    }
}
