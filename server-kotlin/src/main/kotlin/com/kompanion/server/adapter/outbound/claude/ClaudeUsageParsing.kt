package com.kompanion.server.adapter.outbound.claude

import com.kompanion.server.domain.model.UsageWindow
import com.kompanion.server.domain.model.inDisplayOrder
import java.time.Instant

// Both payloads read here are undocumented and have changed shape before,
// so every reader is lenient: unknown keys are ignored, both casings are
// accepted, and a value of the wrong type reads as null instead of throwing.
// See docs/research/claude-usage-window-monitor.md for where each shape
// was found.

// GET /api/oauth/usage. Two shapes seen:
//   older — top-level `five_hour`, `seven_day`, `seven_day_opus`, … objects,
//           each `{ utilization: 0–100, resets_at: ISO }`, any of them null;
//   newer — those may be null and the data is in a `limits` array of
//           `{ kind, utilization | used_percentage | percent, resets_at }`.
// Both are read; `limits` wins for a kind present in both.
@Suppress("UNCHECKED_CAST")
fun parseUsageResponse(body: Map<String, Any?>): List<UsageWindow> {
    val byKind = linkedMapOf<String, UsageWindow>()

    for ((key, value) in body) {
        val obj = value as? Map<String, Any?> ?: continue
        if (!obj.containsKey("utilization")) continue
        byKind[key] = UsageWindow(key, percentOf(obj["utilization"]), instantOf(obj.firstOf("resets_at", "resetsAt")))
    }

    (body["limits"] as? List<Any?>).orEmpty().forEach { item ->
        val obj = item as? Map<String, Any?> ?: return@forEach
        val kind = obj.firstOf("kind", "type", "rateLimitType", "rate_limit_type") as? String ?: return@forEach
        byKind[kind] = UsageWindow(
            kind = kind,
            utilization = percentOf(obj.firstOf("utilization", "used_percentage", "usedPercentage", "percent")),
            resetsAt = instantOf(obj.firstOf("resets_at", "resetsAt")),
        )
    }

    return byKind.values.toList().inDisplayOrder()
}

// A stream-json line from `claude -p`. Returns null for anything that is not
// a rate_limit_event with a window type.
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

// ISO-8601 from the endpoint, epoch seconds from stream-json.
private fun instantOf(value: Any?): Instant? = when (value) {
    is Number -> Instant.ofEpochSecond(value.toLong())
    is String -> runCatching { Instant.parse(value) }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(value).toInstant() }.getOrNull()
    else -> null
}
