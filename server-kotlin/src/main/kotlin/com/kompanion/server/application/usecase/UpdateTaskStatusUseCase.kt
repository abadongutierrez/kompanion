package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.TaskWithRepositories
import com.kompanion.server.application.port.inbound.UpdateTaskStatus
import com.kompanion.server.application.port.inbound.UpdateTaskStatusCommand
import com.kompanion.server.application.port.outbound.TaskStore
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.rule.isValidTaskTransition
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime

// The reference example for this migration: load through a port, apply a
// domain rule, persist through a port. No SQL, no HTTP, no paths — which is
// why UpdateTaskStatusUseCaseTest needs neither Spring nor a database.
//
// @Service and @Transactional are the two annotations ARCHITECTURE.md
// sanctions here: wiring metadata and the transaction boundary, which is the
// use case because the use case is the unit of work.
@Service
class UpdateTaskStatusUseCase(private val tasks: TaskStore) : UpdateTaskStatus {

    @Transactional
    override fun handle(command: UpdateTaskStatusCommand): TaskWithRepositories {
        val existing = tasks.findById(command.taskId)
            ?: throw DomainException.NotFound("task not found")

        if (!isValidTaskTransition(existing.status, command.status)) {
            throw DomainException.Conflict(
                "cannot transition task from ${existing.status} to ${command.status}",
            )
        }

        // updatedAt is set here rather than by the database: there is no
        // trigger for it, and every write path has always stamped it
        // explicitly.
        val saved = tasks.save(existing.copy(status = command.status, updatedAt = OffsetDateTime.now()))
        return TaskWithRepositories(saved, tasks.repositoryIdsFor(command.taskId))
    }
}
