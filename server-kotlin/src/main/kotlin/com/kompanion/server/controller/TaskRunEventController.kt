package com.kompanion.server.controller

import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.service.RunEventsBus
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

// SSE: replays persisted history for this run (task_run_events, in seq
// order), then — if the run isn't finished yet — stays open and streams new
// events live as RunTaskService publishes them, closing once the run
// reaches a terminal status. Frames carry `seq` so a client can dedupe
// anything published in the brief gap between the catch-up query and
// subscribing.
@RestController
@RequestMapping("/api/teams/{teamId}/tasks/{taskId}/runs/{runId}/events")
class TaskRunEventController(
    private val jdbc: JdbcTemplate,
    private val runEventsBus: RunEventsBus,
) {
    class RunNotFoundException : RuntimeException("run not found")

    @ExceptionHandler(RunNotFoundException::class)
    fun handleNotFound(): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("run not found"))

    @GetMapping(produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun stream(
        @PathVariable teamId: UUID,
        @PathVariable taskId: UUID,
        @PathVariable runId: UUID,
    ): SseEmitter {
        val status = jdbc.query(
            "select status from task_runs where id = ? and task_id = ?",
            { rs, _ -> rs.getString("status") },
            runId,
            taskId,
        ).firstOrNull() ?: throw RunNotFoundException()

        val emitter = SseEmitter(0L) // 0 = never times out

        // payload is already-valid raw JSON text (read straight from the DB
        // or from the live process's stdout, never re-parsed) — spliced
        // directly into the frame rather than round-tripped through Jackson.
        // Unlike Node's fire-and-forget res.write(), SseEmitter.send() throws
        // synchronously on a broken pipe — swallow it here (this connection
        // is just dead) rather than let it propagate into the caller, which
        // for live events is RunEventsBus.publishEvent → the run's own
        // streaming loop.
        fun writeEvent(seq: Int, payloadJson: String) {
            try {
                emitter.send(SseEmitter.event().data("""{"seq":$seq,"payload":$payloadJson}"""))
            } catch (e: Exception) {
                // client already gone
            }
        }

        val history = jdbc.query(
            "select seq, payload from task_run_events where run_id = ? order by seq",
            { rs, _ -> rs.getInt("seq") to rs.getString("payload") },
            runId,
        )
        var lastSeq = -1
        for ((seq, payload) in history) {
            lastSeq = seq
            writeEvent(seq, payload)
        }

        if (status != "running") {
            emitter.send(SseEmitter.event().name("done").data("{}"))
            emitter.complete()
            return emitter
        }

        val finalized = AtomicBoolean(false)
        var unsubscribe: (() -> Unit)? = null

        fun finalize() {
            if (!finalized.compareAndSet(false, true)) return
            unsubscribe?.invoke()
            try {
                emitter.send(SseEmitter.event().name("done").data("{}"))
            } catch (e: Exception) {
                // client already gone
            }
            emitter.complete()
        }

        unsubscribe = runEventsBus.subscribe(
            runId,
            onEvent = { seq, payload -> writeEvent(seq, payload) },
            onEnd = { finalize() },
        )
        emitter.onCompletion { unsubscribe?.invoke() }
        emitter.onTimeout { unsubscribe?.invoke() }

        // Closes the remaining race: the run could have finished (and
        // already published its end signal) in the gap between the
        // catch-up query above and subscribing just now, which would
        // otherwise leave this connection subscribed to listener sets that
        // already got cleared and will never fire again. Any events this
        // reconciliation re-sends that were also already delivered live are
        // harmless — the client dedupes by seq.
        val latestStatus = jdbc.query(
            "select status from task_runs where id = ?",
            { rs, _ -> rs.getString("status") },
            runId,
        ).firstOrNull()
        if (latestStatus != null && latestStatus != "running") {
            val missed = jdbc.query(
                "select seq, payload from task_run_events where run_id = ? and seq > ? order by seq",
                { rs, _ -> rs.getInt("seq") to rs.getString("payload") },
                runId,
                lastSeq,
            )
            for ((seq, payload) in missed) {
                writeEvent(seq, payload)
            }
            finalize()
        }

        return emitter
    }
}
