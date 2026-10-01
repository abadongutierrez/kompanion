package com.kompanion.server.service

import com.kompanion.server.entity.Agent
import com.kompanion.server.entity.Project
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.util.UUID

// Path resolution only — the two roots and the rules a harnessPath (library)
// and a Project's workspacePath (workspace) follow. The service is built
// with explicit roots, so no test depends on the environment.
class ClaudeHarnessServiceTest {

    private fun service(library: File, workspace: File) = ClaudeHarnessService(library, workspace)

    private fun project(workspacePath: String) =
        Project(id = UUID.randomUUID(), name = "Test", workspacePath = workspacePath)

    // -- root defaults -------------------------------------------------

    @Test
    fun `library root defaults to library next to server-kotlin`(@TempDir tmp: File) {
        val serverRoot = File(tmp, "server-kotlin")
        assertEquals(File(tmp, "library").path, ClaudeHarnessService.libraryRootFrom(emptyMap(), serverRoot).path)
    }

    @Test
    fun `LIBRARY_ROOT overrides the default`(@TempDir tmp: File) {
        val other = File(tmp, "elsewhere").apply { mkdirs() }
        val root = ClaudeHarnessService.libraryRootFrom(mapOf("LIBRARY_ROOT" to other.path), File(tmp, "server-kotlin"))
        assertEquals(other.canonicalPath, root.path)
    }

    @Test
    fun `workspace root defaults to dot-kompanion workspace in the home folder`(@TempDir tmp: File) {
        val root = ClaudeHarnessService.workspaceRootFrom(emptyMap(), tmp.path)
        assertEquals(File(File(tmp, ".kompanion"), "workspace").path, root.path)
    }

    @Test
    fun `WORKSPACE_ROOT overrides the default`(@TempDir tmp: File) {
        val other = File(tmp, "elsewhere").apply { mkdirs() }
        val root = ClaudeHarnessService.workspaceRootFrom(mapOf("WORKSPACE_ROOT" to other.path), tmp.path)
        assertEquals(other.canonicalPath, root.path)
    }

    @Test
    fun `WORKSPACE_ROOT works when there is no home folder`(@TempDir tmp: File) {
        val root = ClaudeHarnessService.workspaceRootFrom(mapOf("WORKSPACE_ROOT" to tmp.path), null)
        assertEquals(tmp.canonicalPath, root.path)
    }

    @Test
    fun `no home folder and no WORKSPACE_ROOT fails with a clear message`() {
        val error = assertThrows(IllegalStateException::class.java) {
            ClaudeHarnessService.workspaceRootFrom(emptyMap(), null)
        }
        assertTrue(error.message!!.contains("WORKSPACE_ROOT"))
    }

    // -- workspace paths (projects, tasks) -----------------------------

    @Test
    fun `an absolute project path is used as given`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val elsewhere = File(tmp, "elsewhere")
        assertEquals(elsewhere.path, s.resolveProjectWorkspaceDir(project(elsewhere.path)).path)
    }

    @Test
    fun `a relative project path hangs off the workspace root`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val dir = s.resolveProjectWorkspaceDir(project("projects/acme-12345678"))
        assertEquals(File(File(tmp, "ws"), "projects/acme-12345678").path, dir.path)
    }

    @Test
    fun `a task folder lives under its project's tasks directory`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val taskId = UUID.randomUUID()
        val dir = s.resolveWorkspaceDir(project(File(tmp, "proj").path), taskId)
        assertEquals(File(File(File(tmp, "proj"), "tasks"), taskId.toString()).path, dir.path)
    }

    @Test
    fun `a task with a pre-V21 folder keeps using it`(@TempDir tmp: File) {
        // The fallback is keyed on the old folder existing, so that a task
        // with prior runs doesn't silently restart in an empty directory.
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val taskId = UUID.randomUUID()
        val legacy = File(s.legacyWorkspacesRoot, taskId.toString()).apply { mkdirs() }
        assertEquals(legacy.path, s.resolveWorkspaceDir(project(File(tmp, "proj").path), taskId).path)
    }

    @Test
    fun `the legacy tasks folder lives under the workspace root`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        assertEquals(File(File(tmp, "ws"), "tasks").path, s.legacyWorkspacesRoot.path)
    }

    @Test
    fun `a project path inside the workspace root is stored relative to it`(@TempDir tmp: File) {
        val ws = File(tmp, "ws").apply { mkdirs() }
        val s = service(File(tmp, "lib"), ws)
        assertEquals("projects/acme-12345678", s.toStoredWorkspacePath(File(ws, "projects/acme-12345678").path))
    }

    @Test
    fun `a project path outside the workspace root is stored as given`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val elsewhere = File(tmp, "elsewhere").path
        assertEquals(elsewhere, s.toStoredWorkspacePath(elsewhere))
    }

    // -- library paths (harnesses) -------------------------------------

    @Test
    fun `a relative harness path hangs off the library root`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        assertEquals(File(File(tmp, "lib"), "harnesses/engineer").path, s.resolveLibraryPath("harnesses/engineer").path)
    }

    @Test
    fun `an absolute harness path is used as given`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val elsewhere = File(tmp, "elsewhere").path
        assertEquals(elsewhere, s.resolveLibraryPath(elsewhere).path)
    }

    @Test
    fun `a harness path inside the library root is stored relative to it`(@TempDir tmp: File) {
        val lib = File(tmp, "lib").apply { mkdirs() }
        val s = service(lib, File(tmp, "ws"))
        assertEquals("harnesses/engineer", s.toStoredLibraryPath(File(lib, "harnesses/engineer").path))
    }

    @Test
    fun `a harness path outside the library root is stored as given`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val elsewhere = File(tmp, "elsewhere").path
        assertEquals(elsewhere, s.toStoredLibraryPath(elsewhere))
    }

    @Test
    fun `a path in the workspace root is not stored relative as a harness path`(@TempDir tmp: File) {
        // The two rules use different roots: a workspace path is not inside
        // the library, so the library rule leaves it as given.
        val ws = File(tmp, "ws").apply { mkdirs() }
        val s = service(File(tmp, "lib"), ws)
        val inWorkspace = File(ws, "projects/acme-12345678").path
        assertEquals(inWorkspace, s.toStoredLibraryPath(inWorkspace))
    }

    @Test
    fun `library paths and workspace paths resolve against different roots`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        assertNotEquals(s.resolveLibraryPath("same/path").path, s.resolveWorkspacePath("same/path").path)
    }

    @Test
    fun `an agent's harness dir resolves through the library root`(@TempDir tmp: File) {
        val lib = File(tmp, "lib")
        File(lib, "harnesses/engineer").mkdirs()
        val s = service(lib, File(tmp, "ws"))
        val agent = Agent(id = UUID.randomUUID(), title = "Engineer", slug = "engineer", harnessPath = "harnesses/engineer")
        assertEquals(File(lib, "harnesses/engineer").path, s.resolveHarnessDir(agent)?.path)
    }

    @Test
    fun `an agent whose harness folder is missing has no harness dir`(@TempDir tmp: File) {
        val s = service(File(tmp, "lib"), File(tmp, "ws"))
        val agent = Agent(id = UUID.randomUUID(), title = "Engineer", slug = "engineer", harnessPath = "harnesses/engineer")
        assertNull(s.resolveHarnessDir(agent))
    }

    @Test
    fun `built-in harnesses are listed from the library with relative paths`(@TempDir tmp: File) {
        val lib = File(tmp, "lib")
        File(lib, "harnesses/qa").mkdirs()
        File(lib, "harnesses/product_manager").mkdirs()
        val s = service(lib.canonicalFile, File(tmp, "ws"))
        val listed = s.listBuiltinHarnesses()
        assertEquals(listOf("product_manager", "qa"), listed.map { it.slug })
        assertEquals(listOf("harnesses/product_manager", "harnesses/qa"), listed.map { it.path })
        assertEquals("QA", listed.last().title)
    }

    // -- wiring --------------------------------------------------------

    @Test
    fun `spring builds the service through its no-arg constructor and creates the workspace`(@TempDir tmp: File) {
        // contextLoads needs a database; this checks what is new about the
        // bean — that Spring picks the @Autowired no-arg constructor over the
        // internal one, and that it creates the workspace folder. user.home
        // points at a temp folder so the test never touches the real one.
        val realHome = System.getProperty("user.home")
        System.setProperty("user.home", tmp.path)
        try {
            org.springframework.context.annotation.AnnotationConfigApplicationContext(
                ClaudeHarnessService::class.java,
            ).use { context ->
                val built = context.getBean(ClaudeHarnessService::class.java)
                assertEquals("library", built.libraryRoot.name)
                assertEquals(File(File(tmp, ".kompanion"), "workspace").path, built.workspaceRoot.path)
                assertTrue(built.workspaceRoot.isDirectory)
            }
        } finally {
            System.setProperty("user.home", realHome)
        }
    }

    // -- hooks and the pi extension ------------------------------------

    @Test
    fun `hook scripts and the pi extension are read from the library root`(@TempDir tmp: File) {
        val lib = File(tmp, "lib")
        val enforcement = WorkspaceEnforcementService(
            tools.jackson.databind.ObjectMapper(),
            service(lib, File(tmp, "ws")),
        )
        assertEquals(File(lib, "pi/enforce-workspace.ts").path, enforcement.piExtensionFile.path)
        assertEquals(File(lib, "hooks/exec_in_folder.py").path, enforcement.execInFolderScript.path)
    }
}
