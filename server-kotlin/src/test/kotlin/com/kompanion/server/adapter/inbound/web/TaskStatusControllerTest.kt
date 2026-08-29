package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.TaskWithRepositories
import com.kompanion.server.application.port.inbound.UpdateTaskStatus
import com.kompanion.server.application.port.inbound.UpdateTaskStatusCommand
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Task
import com.kompanion.server.domain.model.TaskStatus
import com.kompanion.server.domain.model.TaskType
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

// Routing, serialization and status mapping only — a web-only Spring context
// with no DataSource. The use case is a hand-written stub rather than a mock,
// so this test says nothing about the rules and everything about the wire.
@WebMvcTest(TaskStatusController::class)
@Import(TaskStatusControllerTest.Stubs::class, DomainExceptionHandler::class)
class TaskStatusControllerTest(@Autowired val mockMvc: MockMvc) {

    companion object {
        val TASK_ID: UUID = UUID.fromString("11111111-1111-4111-8111-111111111111")
        val TEAM_ID: UUID = UUID.fromString("22222222-2222-4222-8222-222222222222")
        val REPO_ID: UUID = UUID.fromString("33333333-3333-4333-8333-333333333333")
    }

    // Answers by the status it is asked for: in_progress succeeds, done is
    // refused, anything else is missing. Enough to cover the three mappings
    // without teaching the stub the real rule.
    @TestConfiguration
    class Stubs {
        @Bean
        fun updateTaskStatus(): UpdateTaskStatus = object : UpdateTaskStatus {
            override fun handle(command: UpdateTaskStatusCommand): TaskWithRepositories =
                when (command.status) {
                    TaskStatus.in_progress -> TaskWithRepositories(
                        Task(
                            id = command.taskId,
                            teamId = TEAM_ID,
                            title = "Ship it",
                            type = TaskType.story,
                            status = TaskStatus.in_progress,
                        ),
                        listOf(REPO_ID),
                    )
                    TaskStatus.done -> throw DomainException.Conflict("cannot transition task from backlog to done")
                    else -> throw DomainException.NotFound("task not found")
                }
        }
    }

    private fun patchStatus(status: String) = patch("/api/teams/$TEAM_ID/tasks/$TASK_ID/status")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""{"status":"$status"}""")

    @Test
    fun `an accepted transition returns the task with its repository ids`() {
        mockMvc.perform(patchStatus("in_progress"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(TASK_ID.toString()))
            .andExpect(jsonPath("$.status").value("in_progress"))
            .andExpect(jsonPath("$.repositoryIds[0]").value(REPO_ID.toString()))
    }

    @Test
    fun `a refused transition is a 409 carrying the reason`() {
        mockMvc.perform(patchStatus("done"))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error").value("cannot transition task from backlog to done"))
    }

    @Test
    fun `an unknown task is a 404 in the same error shape`() {
        mockMvc.perform(patchStatus("backlog"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.error").value("task not found"))
    }
}
