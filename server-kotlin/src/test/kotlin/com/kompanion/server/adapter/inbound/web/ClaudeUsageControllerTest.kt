package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.GetClaudeUsage
import com.kompanion.server.domain.model.ClaudeUsage
import com.kompanion.server.domain.model.UsageWindow
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant

// The wire shape only.
@WebMvcTest(ClaudeUsageController::class)
@Import(ClaudeUsageControllerTest.Stubs::class)
class ClaudeUsageControllerTest(@Autowired val mockMvc: MockMvc) {

    @TestConfiguration
    class Stubs {
        @Bean
        fun getClaudeUsage(): GetClaudeUsage = object : GetClaudeUsage {
            override fun handle() = ClaudeUsage(
                available = true,
                reason = null,
                windows = listOf(UsageWindow("five_hour", 62.0, Instant.parse("2026-10-26T14:30:00Z"), "allowed")),
                fetchedAt = Instant.parse("2026-10-26T12:00:00Z"),
            )
        }
    }

    @Test
    fun `usage is served with ISO timestamps`() {
        mockMvc.perform(get("/api/claude/usage"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.available").value(true))
            .andExpect(jsonPath("$.windows[0].kind").value("five_hour"))
            .andExpect(jsonPath("$.windows[0].utilization").value(62.0))
            .andExpect(jsonPath("$.windows[0].resetsAt").value("2026-10-26T14:30:00Z"))
            .andExpect(jsonPath("$.windows[0].status").value("allowed"))
            .andExpect(jsonPath("$.fetchedAt").value("2026-10-26T12:00:00Z"))
    }
}
