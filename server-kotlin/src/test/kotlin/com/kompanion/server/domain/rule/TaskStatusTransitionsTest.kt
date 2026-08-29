package com.kompanion.server.domain.rule

import com.kompanion.server.domain.model.TaskStatus
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue

// The rule packages/shared mirrors in Zod. The UI enforcing it is a
// convenience; this is where it is actually enforced, so it gets the test.
class TaskStatusTransitionsTest {

    @Test
    fun `a task moves forward through the board`() {
        assertTrue(isValidTaskTransition(TaskStatus.backlog, TaskStatus.in_progress))
        assertTrue(isValidTaskTransition(TaskStatus.in_progress, TaskStatus.in_review))
        assertTrue(isValidTaskTransition(TaskStatus.in_review, TaskStatus.done))
    }

    @Test
    fun `it cannot skip straight to done`() {
        assertFalse(isValidTaskTransition(TaskStatus.backlog, TaskStatus.done))
        assertFalse(isValidTaskTransition(TaskStatus.in_progress, TaskStatus.done))
    }

    @Test
    fun `done is terminal`() {
        for (target in TaskStatus.entries.filter { it != TaskStatus.done }) {
            assertFalse(isValidTaskTransition(TaskStatus.done, target), "done -> $target")
        }
    }

    @Test
    fun `blocked is reachable from and returns to every non-terminal status`() {
        for (status in listOf(TaskStatus.in_progress, TaskStatus.in_review)) {
            assertTrue(isValidTaskTransition(status, TaskStatus.blocked), "$status -> blocked")
            assertTrue(isValidTaskTransition(TaskStatus.blocked, status), "blocked -> $status")
        }
    }

    @Test
    fun `staying put is always allowed`() {
        for (status in TaskStatus.entries) {
            assertTrue(isValidTaskTransition(status, status), "$status -> $status")
        }
    }
}
