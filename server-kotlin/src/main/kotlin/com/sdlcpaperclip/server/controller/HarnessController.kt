package com.sdlcpaperclip.server.controller

import com.sdlcpaperclip.server.service.ClaudeHarnessService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/harnesses")
class HarnessController(private val claudeHarnessService: ClaudeHarnessService) {

    @GetMapping
    fun list() = claudeHarnessService.listBuiltinHarnesses()
}
