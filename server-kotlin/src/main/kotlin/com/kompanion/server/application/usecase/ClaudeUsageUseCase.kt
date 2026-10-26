package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.GetClaudeUsage
import com.kompanion.server.application.port.inbound.RecordClaudeRateLimit
import com.kompanion.server.application.port.outbound.ClaudeUsageSource
import com.kompanion.server.application.port.outbound.UsageReading
import com.kompanion.server.domain.model.ClaudeUsage
import com.kompanion.server.domain.model.UsageWindow
import com.kompanion.server.domain.model.sameResetBoundary
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant

// Both operations in one class because they share one thing: the cached
// reading. The cache is the point — every open tab polls, and the endpoint
// behind the source is undocumented and should not be hammered.
//
// Two locks. `fetching` lets one endpoint read run at a time, so concurrent
// tabs with a cold cache make one request, not N. `state` guards the cache
// and the recorded events and is only held for in-memory work, never across
// the read: rate-limit events arrive on a run's stdout thread, and a 10 s
// fetch must not stall it.
@Service
class ClaudeUsageUseCase(
    private val source: ClaudeUsageSource,
    private val clock: Clock,
) : GetClaudeUsage, RecordClaudeRateLimit {

    private class RecordedEvent(val window: UsageWindow, val at: Instant)

    private val fetching = Any()
    private val state = Any()
    private var cached: ClaudeUsage? = null

    // The latest event per window kind, kept so an endpoint refresh does not
    // drop a status the endpoint has no field for. See overlayEvents.
    private val events = mutableMapOf<String, RecordedEvent>()

    override fun handle(): ClaudeUsage {
        freshCache()?.let { return it }
        synchronized(fetching) {
            // Another caller may have refreshed while this one waited.
            freshCache()?.let { return it }

            val startedAt = clock.instant()
            val reading = source.read()
            val base = when (reading) {
                is UsageReading.Windows -> ClaudeUsage(true, null, reading.windows, startedAt)
                is UsageReading.Unavailable -> ClaudeUsage.unavailable(reading.reason, startedAt)
            }
            synchronized(state) {
                val fresh = overlayEvents(base, startedAt)
                cached = fresh
                return fresh
            }
        }
    }

    // Merges into what is cached but keeps its TTL: an event only speaks for
    // one window, so a long run sending them must not stop the endpoint from
    // being read again for the others. With nothing cached the event starts
    // the readout, and its TTL.
    override fun handle(window: UsageWindow) {
        synchronized(state) {
            val now = clock.instant()
            events[window.kind] = RecordedEvent(window, now)
            val current = cached ?: ClaudeUsage(true, null, emptyList(), now)
            cached = current.withWindow(window, current.fetchedAt)
        }
    }

    private fun freshCache(): ClaudeUsage? = synchronized(state) {
        cached?.takeIf { Duration.between(it.fetchedAt, clock.instant()) < TTL }
    }

    // Re-applies recorded events to a new endpoint reading. An event that
    // arrived while the read was in flight is newer than it, so it merges in
    // whole. An older one only brings back its status — the endpoint's
    // percent is fresher — and only while it still speaks for the same
    // window: it is dropped once that window's reset time passes, once the
    // endpoint reports a different reset boundary, or, with no reset time
    // known, after STATUS_TTL. Caller holds `state`.
    private fun overlayEvents(base: ClaudeUsage, startedAt: Instant): ClaudeUsage {
        val now = clock.instant()
        var result = base
        val iterator = events.values.iterator()
        while (iterator.hasNext()) {
            val event = iterator.next()
            if (!event.at.isBefore(startedAt)) {
                result = result.withWindow(event.window, result.fetchedAt)
                continue
            }
            val endpoint = base.windows.firstOrNull { it.kind == event.window.kind }
            val resetsAt = event.window.resetsAt ?: endpoint?.resetsAt
            val expired = if (resetsAt != null) !now.isBefore(resetsAt)
            else Duration.between(event.at, now) >= STATUS_TTL
            if (expired || (endpoint != null && !sameResetBoundary(endpoint.resetsAt, event.window.resetsAt))) {
                iterator.remove()
                continue
            }
            val status = event.window.status ?: continue
            if (endpoint == null) continue
            result = result.withWindow(endpoint.copy(status = status), result.fetchedAt)
        }
        return result
    }

    companion object {
        val TTL: Duration = Duration.ofSeconds(60)
        val STATUS_TTL: Duration = Duration.ofMinutes(5)
    }
}
