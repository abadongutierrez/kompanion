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
//   newer — a `limits` array of
//           `{ kind, utilization | used_percentage | percent, resets_at }`.
// A real response (2026-10) carries both at once, with the array naming the
// same windows differently (`session` = `five_hour`, `weekly_all` =
// `seven_day`), so array kinds are mapped onto the flat names and `limits`
// wins for a window present in both. Only flat keys that name a window are
// read: `extra_usage` also has a `utilization` key but is the extra-credits
// setting, and a flat window with no utilization is treated as absent.
@Suppress("UNCHECKED_CAST")
fun parseUsageResponse(body: Map<String, Any?>): List<UsageWindow> {
    val byKind = linkedMapOf<String, UsageWindow>()

    for ((key, value) in body) {
        if (!isWindowKey(key)) continue
        val obj = value as? Map<String, Any?> ?: continue
        val percent = percentOf(obj["utilization"]) ?: continue
        byKind[key] = UsageWindow(key, percent, instantOf(obj.firstOf("resets_at", "resetsAt")))
    }

    (body["limits"] as? List<Any?>).orEmpty().forEach { item ->
        val obj = item as? Map<String, Any?> ?: return@forEach
        val kind = (obj.firstOf("kind", "type", "rateLimitType", "rate_limit_type") as? String)
            ?.let(::flatKindOf) ?: return@forEach
        byKind[kind] = UsageWindow(
            kind = kind,
            utilization = percentOf(obj.firstOf("utilization", "used_percentage", "usedPercentage", "percent")),
            resetsAt = instantOf(obj.firstOf("resets_at", "resetsAt")),
        )
    }

    return byKind.values.toList().inDisplayOrder()
}

private fun isWindowKey(key: String): Boolean = key == "five_hour" || key.startsWith("seven_day")

// `limits` kind -> the flat key name, which is also what a stream-json
// rate_limit_event calls it, so both sources merge into one window.
private fun flatKindOf(kind: String): String = when {
    kind == "session" -> "five_hour"
    kind == "weekly_all" -> "seven_day"
    kind.startsWith("weekly_") -> "seven_day_" + kind.removePrefix("weekly_")
    else -> kind
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

// ISO-8601 from the endpoint, epoch seconds from stream-json. An epoch value
// outside Instant's range reads as unknown, like an unparseable string.
private fun instantOf(value: Any?): Instant? = when (value) {
    is Number -> runCatching { Instant.ofEpochSecond(value.toLong()) }.getOrNull()
    is String -> runCatching { Instant.parse(value) }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(value).toInstant() }.getOrNull()
    else -> null
}
