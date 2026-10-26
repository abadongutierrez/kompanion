package com.kompanion.server.domain.model

import java.time.Instant

// One Claude subscription usage window: `five_hour`, `seven_day`, or a
// per-model weekly one. `kind` stays a string because the set is Anthropic's,
// undocumented, and grows without telling us.
//
// utilization is a percent, 0–100, and may be null: a rate_limit_event from a
// headless run often carries only a status. status is that event's
// `allowed` / `allowed_warning` / `rejected`, and null when the reading came
// from the usage endpoint, which has no such field.
data class UsageWindow(
    val kind: String,
    val utilization: Double?,
    val resetsAt: Instant?,
    val status: String? = null,
)

// How much of the Claude usage windows is left, for the machine and account
// the server runs as. Not per project: every Claude Code run on this server
// draws from the same subscription.
//
// available=false means "we could not tell" (no credentials file, API-key
// setup, the endpoint failed) and reason says which — never "no usage".
data class ClaudeUsage(
    val available: Boolean,
    val reason: String?,
    val windows: List<UsageWindow>,
    val fetchedAt: Instant,
) {
    // A run's rate_limit_event is fresher than the last endpoint read but
    // often thinner, so it updates a window rather than replacing it: a
    // missing percent or reset time keeps the value already known.
    fun withWindow(update: UsageWindow, at: Instant): ClaudeUsage {
        val existing = windows.firstOrNull { it.kind == update.kind }
        val merged = if (existing == null) update else UsageWindow(
            kind = update.kind,
            utilization = update.utilization ?: existing.utilization,
            resetsAt = update.resetsAt ?: existing.resetsAt,
            status = update.status ?: existing.status,
        )
        val others = windows.filter { it.kind != update.kind }
        return ClaudeUsage(true, null, (others + merged).inDisplayOrder(), at)
    }

    companion object {
        fun unavailable(reason: String, at: Instant) = ClaudeUsage(false, reason, emptyList(), at)
    }
}

// Session window first, then the weekly ones — the order the sidebar shows.
private fun windowOrder(kind: String): Int = when (kind) {
    "five_hour" -> 0
    "seven_day" -> 1
    else -> 2
}

fun List<UsageWindow>.inDisplayOrder(): List<UsageWindow> = sortedBy { windowOrder(it.kind) }
