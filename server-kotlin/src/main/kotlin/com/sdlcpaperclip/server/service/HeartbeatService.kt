package com.sdlcpaperclip.server.service

import com.sdlcpaperclip.server.dto.HeartbeatStatusResponse
import com.sdlcpaperclip.server.entity.Task
import com.sdlcpaperclip.server.entity.TaskStatus
import com.sdlcpaperclip.server.repository.RoleRepository
import com.sdlcpaperclip.server.repository.TaskRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

@Service
class HeartbeatService(
    private val taskRepository: TaskRepository,
    private val roleRepository: RoleRepository,
    private val claudeHarnessService: ClaudeHarnessService,
    private val runTaskService: RunTaskService,
    @Value("\${heartbeat.enabled:false}") private val enabled: Boolean,
    @Value("\${heartbeat.interval-ms:30000}") private val intervalMs: Long,
) {
    @Volatile private var lastTickAt: OffsetDateTime? = null
    @Volatile private var lastRunTaskId: UUID? = null
    @Volatile private var lastError: String? = null
    private val ticking = AtomicBoolean(false)

    init {
        if (!enabled) {
            println("heartbeat disabled (set HEARTBEAT_ENABLED=true to enable)")
        } else {
            println("heartbeat enabled, ticking every ${intervalMs}ms")
        }
    }

    private fun findEligibleTask(): Pair<Task, com.sdlcpaperclip.server.entity.Role>? {
        val candidates = taskRepository.findByStatusOrderByCreatedAt(TaskStatus.backlog)
        for (task in candidates) {
            val roleId = task.roleId ?: continue
            val role = roleRepository.findById(roleId).orElse(null) ?: continue
            if (claudeHarnessService.resolveHarnessDir(role) != null) {
                return task to role
            }
        }
        return null
    }

    // Guarded by `enabled` at the top rather than skipping @Scheduled
    // registration entirely — functionally equivalent to the original's
    // "no setInterval at all when disabled" (negligible cost either way),
    // simpler than conditional bean registration.
    @Scheduled(fixedDelayString = "\${heartbeat.interval-ms:30000}")
    fun tick() {
        if (!enabled) return
        if (!ticking.compareAndSet(false, true)) return
        lastTickAt = OffsetDateTime.now()

        try {
            val found = findEligibleTask()
            if (found != null) {
                val (task, role) = found
                lastRunTaskId = task.id
                runTaskService.runTaskWithClaude(task, role)
                lastError = null
            }
        } catch (e: Exception) {
            lastError = e.message ?: e.toString()
            System.err.println("heartbeat tick failed: ${e.message}")
        } finally {
            ticking.set(false)
        }
    }

    fun getStatus(): HeartbeatStatusResponse = HeartbeatStatusResponse(
        enabled = enabled,
        intervalMs = intervalMs,
        lastTickAt = lastTickAt,
        lastRunTaskId = lastRunTaskId,
        lastError = lastError,
    )
}
