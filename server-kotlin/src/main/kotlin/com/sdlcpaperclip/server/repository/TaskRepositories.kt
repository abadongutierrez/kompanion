package com.sdlcpaperclip.server.repository

import com.sdlcpaperclip.server.entity.Task
import com.sdlcpaperclip.server.entity.TaskComment
import com.sdlcpaperclip.server.entity.TaskDependency
import com.sdlcpaperclip.server.entity.TaskStatus
import org.springframework.data.repository.ListCrudRepository
import java.util.UUID

interface TaskRepository : ListCrudRepository<Task, UUID> {
    // Heartbeat candidate scan: backlog tasks with a role assigned, oldest
    // first. Spring Data JDBC can't express "role_id is not null" via a
    // derived-query keyword cleanly, so this filters status only and the
    // caller (HeartbeatService) drops any with a null roleId itself —
    // acceptable since backlog tasks are a small working set.
    fun findByStatusOrderByCreatedAt(status: TaskStatus): List<Task>
}

interface TaskDependencyRepository : ListCrudRepository<TaskDependency, UUID> {
    fun findByTaskIdOrderByCreatedAt(taskId: UUID): List<TaskDependency>
}

interface TaskCommentRepository : ListCrudRepository<TaskComment, UUID> {
    fun findByTaskIdOrderByCreatedAt(taskId: UUID): List<TaskComment>
}
