package com.kompanion.server.adapter.outbound.claude

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper

// QA: a real GET /api/oauth/usage response (Max login, 2026-10-26), trimmed
// of the dozens of null codename keys and the spend/breakdown blocks. It
// carries BOTH shapes at once: the flat `five_hour` / `seven_day` objects
// and a `limits` array whose kinds are `session` / `weekly_all`, not the
// flat key names. It also has `extra_usage`, which has a `utilization` key
// but is not a usage window.
//
// The sidebar should get one bar per window, not one per shape.
class RealUsagePayloadTest {

    private val mapper = JsonMapper.builder().build()

    @Suppress("UNCHECKED_CAST")
    private val body = mapper.readValue(
        """
        {"five_hour":{"utilization":97.0,"resets_at":"2026-10-26T22:29:59.941140+00:00","limit_dollars":null,"used_dollars":null,"remaining_dollars":null,"locked_reason":null},
         "seven_day":{"utilization":25.0,"resets_at":"2026-10-28T03:59:59.941157+00:00","limit_dollars":null,"used_dollars":null,"remaining_dollars":null,"locked_reason":null},
         "seven_day_oauth_apps":null,"seven_day_opus":null,"seven_day_sonnet":null,"iguana_necktie":null,"pace":null,
         "extra_usage":{"is_enabled":false,"monthly_limit":null,"used_credits":null,"utilization":null,"currency":null},
         "limits":[
           {"kind":"session","group":"session","percent":97,"severity":"critical","resets_at":"2026-10-26T22:29:59.941140+00:00","scope":null,"is_active":true},
           {"kind":"weekly_all","group":"weekly","percent":25,"severity":"normal","resets_at":"2026-10-28T03:59:59.941157+00:00","scope":null,"is_active":false}],
         "spend":{"percent":0,"severity":"normal","enabled":false},
         "member_dashboard_available":false}
        """,
        Map::class.java,
    ) as Map<String, Any?>

    @Test
    fun `a real payload with both shapes yields one window per limit`() {
        val windows = parseUsageResponse(body)

        assertEquals(2, windows.size, "got ${windows.map { it.kind }}")
        assertEquals(listOf(97.0, 25.0), windows.map { it.utilization })
    }

    @Test
    fun `extra_usage is not a usage window`() {
        val windows = parseUsageResponse(body)

        assertEquals(emptyList<String>(), windows.map { it.kind }.filter { it == "extra_usage" })
    }
}
