package com.kompanion.server.service

import com.kompanion.server.entity.Project
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.util.UUID

// Path resolution only — the rules a Project's workspacePath and a Task's
// folder follow. The service reads WORKSPACE_ROOT from the environment at
// construction, so these tests work with whatever it resolves to rather than
// trying to set it.
class ClaudeHarnessServiceTest {

    private val service = ClaudeHarnessService()

    private fun project(workspacePath: String) =
        Project(id = UUID.randomUUID(), name = "Test", workspacePath = workspacePath)

    @Test
    fun `an absolute project path is used as given`(@TempDir tmp: File) {
        val dir = service.resolveProjectWorkspaceDir(project(tmp.path))
        assertEquals(tmp.path, dir.path)
    }

    @Test
    fun `a relative project path hangs off the workspace root`() {
        val dir = service.resolveProjectWorkspaceDir(project("projects/acme-12345678"))
        assertEquals(File(service.workspaceRoot, "projects/acme-12345678").path, dir.path)
    }

    @Test
    fun `a task folder lives under its project's tasks directory`(@TempDir tmp: File) {
        val taskId = UUID.randomUUID()
        val dir = service.resolveWorkspaceDir(project(tmp.path), taskId)
        assertEquals(File(File(tmp, "tasks"), taskId.toString()).path, dir.path)
    }

    @Test
    fun `a task with a pre-V21 folder keeps using it`(@TempDir tmp: File) {
        // The fallback is keyed on the old folder existing, so that a task
        // with prior runs doesn't silently restart in an empty directory.
        val taskId = UUID.randomUUID()
        val legacy = File(service.legacyWorkspacesRoot, taskId.toString())
        try {
            legacy.mkdirs()
            assertEquals(legacy.path, service.resolveWorkspaceDir(project(tmp.path), taskId).path)
        } finally {
            legacy.deleteRecursively()
        }
    }

    @Test
    fun `a path inside the workspace root is stored relative to it`() {
        val absolute = File(service.workspaceRoot, "harnesses/engineer").path
        assertEquals("harnesses/engineer", service.toStoredPath(absolute))
    }

    @Test
    fun `a path outside the workspace root is stored verbatim`(@TempDir tmp: File) {
        assertEquals(tmp.path, service.toStoredPath(tmp.path))
    }
}
