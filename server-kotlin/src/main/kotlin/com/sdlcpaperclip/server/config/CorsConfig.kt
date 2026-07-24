package com.sdlcpaperclip.server.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

// Mirrors today's Express `cors()` call with no options: fully open, every
// origin/method/header allowed. No auth of any kind exists anywhere in this
// app today, so this isn't a narrowing from some prior stricter policy.
@Configuration
class CorsConfig {
    @Bean
    fun corsConfigurer() = object : WebMvcConfigurer {
        override fun addCorsMappings(registry: CorsRegistry) {
            registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("*")
                .allowedHeaders("*")
        }
    }
}
