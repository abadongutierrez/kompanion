package com.kompanion.server.service.runner

import com.kompanion.server.domain.model.UsageWindow
import java.time.Instant

// A stream-json line from `claude -p`. Returns null for anything that is not
// a rate_limit_event with a window type. Lives with the runner because it is
// the runner's output format; the usage endpoint's payload is read by
// adapter/outbound/claude/ClaudeUsageParsing.kt. Both are undocumented, so
// the reading is lenient: both casings are accepted, and a value of the
// wrong type reads as null instead of throwing.
//
//   {"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning",
//    "resetsAt":1761500000,"rateLimitType":"five_hour","utilization":0.82}}
//
// utilization here has been seen as a 0–1 fraction, unlike the endpoint's
// 0–100, so a value of 1 or below is scaled up. used_percentage, when present,
// is already a percent.
@Suppress("UNCHECKED_CAST")
fun parseRateLimitEvent(event: Map<String, Any?>): UsageWindow? {
    if (event["type"] != "rate_limit_event") return null
    val info = event.firstOf("rate_limit_info", "rateLimitInfo") as? Map<String, Any?> ?: return null
    val kind = info.firstOf("rateLimitType", "rate_limit_type") as? String ?: return null

    val percent = percentOf(info.firstOf("used_percentage", "usedPercentage"))
        ?: percentOf(info["utilization"])?.let { if (it <= 1.0) it * 100 else it }

    return UsageWindow(
        kind = kind,
        utilization = percent,
        resetsAt = instantOf(info.firstOf("resetsAt", "resets_at")),
        status = info["status"] as? String,
    )
}

private fun Map<String, Any?>.firstOf(vararg keys: String): Any? =
    keys.firstNotNullOfOrNull { this[it] }

private fun percentOf(value: Any?): Double? = (value as? Number)?.toDouble()

// Epoch seconds as seen, ISO-8601 accepted too. An epoch value outside
// Instant's range reads as unknown, like an unparseable string.
private fun instantOf(value: Any?): Instant? = when (value) {
    is Number -> runCatching { Instant.ofEpochSecond(value.toLong()) }.getOrNull()
    is String -> runCatching { Instant.parse(value) }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(value).toInstant() }.getOrNull()
    else -> null
}
