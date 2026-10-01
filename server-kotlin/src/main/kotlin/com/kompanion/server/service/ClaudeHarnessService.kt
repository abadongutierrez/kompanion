package com.kompanion.server.service

import com.kompanion.server.dto.BuiltinHarnessResponse
import com.kompanion.server.entity.Agent
import com.kompanion.server.entity.Project
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Service
import java.io.File

// Two roots, kept apart on purpose:
//
//   libraryRoot   — tracked templates the app only reads: harnesses/ (starter
//                   folders a new Agent's harnessPath can point at, listed via
//                   listBuiltinHarnesses() below), hooks/ and pi/.
//   workspaceRoot — everything the app generates or copies: project folders
//                   and the Task folders inside them. Defaults to
//                   ~/.kompanion/workspace, outside the repo.
//
// Task workspaces are shared across agents: whichever agent a Task is
// currently assigned to runs in the *same* directory, so e.g. QA can see
// Engineer's actual output instead of an agent-isolated copy. The library
// stays a pure, immutable template; the workspace is the mutable runtime
// state.
@Service
class ClaudeHarnessService internal constructor(
    val libraryRoot: File,
    val workspaceRoot: File,
) {

    @Autowired
    constructor() : this(
        libraryRootFrom(System.getenv(), File(".").canonicalFile),
        workspaceRootFrom(System.getenv(), System.getProperty("user.home")).also { it.mkdirs() },
    )

    private val harnessesRoot = File(libraryRoot, "harnesses")

    // The pre-V21 home for every task folder in the app, kept for one reason:
    // resolveWorkspaceDir falls back to it so a task that already has runs
    // keeps its history instead of starting in an empty folder under its
    // project. New tasks never land here.
    val legacyWorkspacesRoot: File = File(workspaceRoot, "tasks")

    // A stored harnessPath is either absolute (a harness anywhere on disk)
    // or relative to libraryRoot (the normal case — "harnesses/engineer").
    // Relative is what gets stored for anything under library/, so the
    // database stays portable across machines and checkouts; see V16.
    fun resolveLibraryPath(path: String): File {
        val asGiven = File(path)
        return if (asGiven.isAbsolute) asGiven else File(libraryRoot, path)
    }

    // The inverse, applied on the way in: an absolute path pointing inside
    // libraryRoot is stored relative to it. Anything else is stored
    // verbatim — there's nothing to relativize a path outside library/
    // against.
    fun toStoredLibraryPath(path: String): String = relativeTo(libraryRoot, path)

    // A Project's workspacePath follows the same rule, against workspaceRoot:
    // absolute, or relative to it ("projects/acme-1a2b3c4d").
    fun resolveWorkspacePath(path: String): File {
        val asGiven = File(path)
        return if (asGiven.isAbsolute) asGiven else File(workspaceRoot, path)
    }

    fun toStoredWorkspacePath(path: String): String = relativeTo(workspaceRoot, path)

    private fun relativeTo(root: File, path: String): String {
        val file = File(path)
        if (!file.isAbsolute) return path
        val canonical = file.canonicalFile
        val canonicalRoot = root.canonicalFile
        return if (canonical.path.startsWith(canonicalRoot.path + File.separator)) {
            canonical.path.removePrefix(canonicalRoot.path + File.separator)
        } else {
            path
        }
    }

    // harnessPath is the sole source of an Agent's harness — no fallback.
    fun resolveHarnessDir(agent: Agent): File? {
        val dir = resolveLibraryPath(agent.harnessPath)
        return if (dir.exists()) dir else null
    }

    // A Project's own folder.
    fun resolveProjectWorkspaceDir(project: Project): File =
        resolveWorkspacePath(project.workspacePath)

    // A Task's folder inside its Project's workspace. The legacy fallback is
    // deliberately keyed on the old folder existing, not on a flag: a task
    // created before V21 has its manifest, logs and any agent output there,
    // and moving those from application code would be a filesystem migration
    // nobody asked for.
    fun resolveWorkspaceDir(project: Project, taskId: java.util.UUID): File {
        val dir = File(File(resolveProjectWorkspaceDir(project), "tasks"), taskId.toString())
        if (dir.exists()) return dir
        val legacy = File(legacyWorkspacesRoot, taskId.toString())
        return if (legacy.exists()) legacy else dir
    }

    private val knownAcronyms = setOf("qa")

    fun listBuiltinHarnesses(): List<BuiltinHarnessResponse> {
        if (!harnessesRoot.exists()) return emptyList()
        return harnessesRoot.listFiles { f -> f.isDirectory }
            ?.sortedBy { it.name }
            ?.map { dir ->
                val title = dir.name.split("_").joinToString(" ") { word ->
                    if (word in knownAcronyms) word.uppercase() else word.replaceFirstChar { it.uppercase() }
                }
                // Relative, so the UI can hand it straight back to
                // POST /api/agents and have it stored as-is.
                BuiltinHarnessResponse(slug = dir.name, title = title, path = toStoredLibraryPath(dir.path))
            }
            ?: emptyList()
    }

    companion object {
        // Both defaults assume the app runs from server-kotlin/ (true for
        // `gradle bootRun` and the packaged jar run from that directory), so
        // the parent of the working directory is the repo root. The removed
        // Node server resolved this from its own source file location, which
        // is cwd-independent; this is a known simplification to revisit if
        // the app ever needs to run from an arbitrary directory.

        // library/ sits at the repo root, a sibling of server-kotlin/.
        // LIBRARY_ROOT lets it be pointed elsewhere.
        fun libraryRootFrom(env: Map<String, String>, serverRoot: File): File =
            env["LIBRARY_ROOT"]?.let { File(it).canonicalFile }
                ?: File(serverRoot.parentFile, "library")

        // The workspace is generated data, so it lives outside the repo, in
        // the operator's home, and every checkout and worktree shares it.
        // WORKSPACE_ROOT lets it be pointed elsewhere.
        fun workspaceRootFrom(env: Map<String, String>, home: String?): File =
            env["WORKSPACE_ROOT"]?.let { File(it).canonicalFile }
                ?: home?.takeIf { it.isNotBlank() }?.let { File(File(it, ".kompanion"), "workspace") }
                ?: throw IllegalStateException(
                    "Cannot find a home folder for the default workspace (~/.kompanion/workspace). " +
                        "Set WORKSPACE_ROOT to an absolute path.",
                )
    }
}
