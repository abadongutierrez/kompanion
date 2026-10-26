package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.GetClaudeUsage
import com.kompanion.server.application.port.inbound.RecordClaudeRateLimit
import com.kompanion.server.application.port.outbound.ClaudeUsageSource
import com.kompanion.server.application.port.outbound.UsageReading
import com.kompanion.server.domain.model.ClaudeUsage
import com.kompanion.server.domain.model.UsageWindow
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration

// Both operations in one class because they share one thing: the cached
// reading. The cache is the point — every open tab polls, and the endpoint
// behind the source is undocumented and should not be hammered. Calls are
// serialized, so concurrent tabs with a cold cache make one request, not N.
@Service
class ClaudeUsageUseCase(
    private val source: ClaudeUsageSource,
    private val clock: Clock,
) : GetClaudeUsage, RecordClaudeRateLimit {

    private var cached: ClaudeUsage? = null

    @Synchronized
    override fun handle(): ClaudeUsage {
        val now = clock.instant()
        cached?.takeIf { Duration.between(it.fetchedAt, now) < TTL }?.let { return it }

        val fresh = when (val reading = source.read()) {
            is UsageReading.Windows -> ClaudeUsage(true, null, reading.windows, now)
            is UsageReading.Unavailable -> ClaudeUsage.unavailable(reading.reason, now)
        }
        cached = fresh
        return fresh
    }

    // Merges into what is cached but keeps its TTL: an event only speaks for
    // one window, so a long run sending them must not stop the endpoint from
    // being read again for the others. With nothing cached the event starts
    // the readout, and its TTL.
    @Synchronized
    override fun handle(window: UsageWindow) {
        val current = cached ?: ClaudeUsage(true, null, emptyList(), clock.instant())
        cached = current.withWindow(window, current.fetchedAt)
    }

    companion object {
        val TTL: Duration = Duration.ofSeconds(60)
    }
}
