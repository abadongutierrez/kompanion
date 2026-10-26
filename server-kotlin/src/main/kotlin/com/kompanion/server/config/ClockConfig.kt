package com.kompanion.server.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

// Use cases ask a Clock for the time rather than calling Instant.now(), so a
// test can hand them a fixed one (ARCHITECTURE.md, "Rules of thumb").
@Configuration
class ClockConfig {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}
