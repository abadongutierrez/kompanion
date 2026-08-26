package com.kompanion.server.repository

import com.kompanion.server.entity.Task
import com.kompanion.server.entity.TaskComment
import com.kompanion.server.entity.TaskDependency
import com.kompanion.server.entity.TaskStatus
import org.springframework.data.repository.ListCrudRepository
import java.util.UUID

interface TaskRepository : ListCrudRepository<Task, UUID> {
    // Heartbeat candidate scan: backlog tasks with an agent assigned,
    // oldest first. Spring Data JDBC can't express "agent_id is not null"
    // via a derived-query keyword cleanly, so this filters status only and
    // the caller (HeartbeatService) drops any with a null agentId itself —
    // acceptable since backlog tasks are a small working set.
    fun findByStatusOrderByCreatedAt(status: TaskStatus): List<Task>
}

interface TaskDependencyRepository : ListCrudRepository<TaskDependency, UUID> {
    fun findByTaskIdOrderByCreatedAt(taskId: UUID): List<TaskDependency>
}

interface TaskCommentRepository : ListCrudRepository<TaskComment, UUID> {
    fun findByTaskIdOrderByCreatedAt(taskId: UUID): List<TaskComment>
}
