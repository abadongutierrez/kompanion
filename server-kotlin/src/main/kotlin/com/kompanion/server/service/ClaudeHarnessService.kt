package com.kompanion.server.service

import com.kompanion.server.dto.BuiltinHarnessResponse
import com.kompanion.server.entity.Agent
import org.springframework.stereotype.Service
import java.io.File

// workspace/harnesses/ holds starter templates (engineer, qa,
// product_manager, project_manager) — no longer auto-selected by any
// discipline convention, just pre-made folders a new Agent's harnessPath
// can point at, listed via listBuiltinHarnesses() below.
//
// Task workspaces are shared across agents: whichever agent a Task is
// currently assigned to runs in the *same* directory, so e.g. QA can see
// Engineer's actual output instead of an agent-isolated copy. harnesses/
// stays a pure, immutable template; workspace/tasks/ is the mutable
// runtime state.
@Service
class ClaudeHarnessService {

    // Resolved from the JVM's working directory — assumes the app is run
    // from server-kotlin/ (true for `gradle bootRun`/the packaged jar run
    // from that directory, matching every run so far). The removed Node
    // server resolved this from its own source file location via
    // import.meta.url, which is cwd-independent; this is a known
    // simplification to revisit if this ever needs to run from an
    // arbitrary working directory.
    private val serverRoot = File(".").canonicalFile

    // workspace/ lives at the repo root, a sibling of server-kotlin/ (it
    // was hoisted there back when a second backend shared it).
    // WORKSPACE_ROOT lets it be pointed elsewhere; the default assumes
    // this server runs from server-kotlin/, so the parent is the repo
    // root.
    val workspaceRoot: File = System.getenv("WORKSPACE_ROOT")?.let { File(it).canonicalFile }
        ?: File(serverRoot.parentFile, "workspace")

    private val harnessesRoot = File(workspaceRoot, "harnesses")
    val workspacesRoot: File = File(workspaceRoot, "tasks")

    // A stored harnessPath is either absolute (a harness anywhere on disk)
    // or relative to workspaceRoot (the normal case — "harnesses/engineer").
    // Relative is what gets stored for anything under workspace/, so the
    // database stays portable across machines and checkouts; see V16.
    fun resolveHarnessPath(harnessPath: String): File {
        val asGiven = File(harnessPath)
        return if (asGiven.isAbsolute) asGiven else File(workspaceRoot, harnessPath)
    }

    // The inverse, applied on the way in: an absolute path pointing inside
    // workspaceRoot is stored relative to it. Anything else is stored
    // verbatim — there's nothing to relativize a path outside workspace/
    // against.
    fun toStoredHarnessPath(harnessPath: String): String {
        val file = File(harnessPath)
        if (!file.isAbsolute) return harnessPath
        val canonical = file.canonicalFile
        val root = workspaceRoot.canonicalFile
        return if (canonical.path.startsWith(root.path + File.separator)) {
            canonical.path.removePrefix(root.path + File.separator)
        } else {
            harnessPath
        }
    }

    // harnessPath is the sole source of an Agent's harness — no fallback.
    fun resolveHarnessDir(agent: Agent): File? {
        val dir = resolveHarnessPath(agent.harnessPath)
        return if (dir.exists()) dir else null
    }

    fun resolveWorkspaceDir(taskId: java.util.UUID): File = File(workspacesRoot, taskId.toString())

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
                BuiltinHarnessResponse(slug = dir.name, title = title, path = toStoredHarnessPath(dir.path))
            }
            ?: emptyList()
    }
}
