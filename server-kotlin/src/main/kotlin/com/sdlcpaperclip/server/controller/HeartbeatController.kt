package com.sdlcpaperclip.server.controller

import com.sdlcpaperclip.server.service.HeartbeatService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/heartbeat")
class HeartbeatController(private val heartbeatService: HeartbeatService) {

    @GetMapping("/status")
    fun status() = heartbeatService.getStatus()
}
