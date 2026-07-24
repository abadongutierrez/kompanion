package com.sdlcpaperclip.server.service

import com.sdlcpaperclip.server.dto.BuiltinHarnessResponse
import com.sdlcpaperclip.server.entity.Role
import org.springframework.stereotype.Service
import java.io.File

// server/harnesses/ holds starter templates (engineer, qa, product_manager,
// project_manager) — no longer auto-selected by any discipline convention,
// just pre-made folders a new Role's harnessPath can point at, listed via
// listBuiltinHarnesses() below.
//
// Task workspaces are shared across roles: whichever role a Task is
// currently assigned to runs in the *same* directory, so e.g. QA can see
// Engineer's actual output instead of a role-isolated copy. harnesses/
// stays a pure, immutable template; workspaces/ is the mutable runtime
// state.
@Service
class ClaudeHarnessService {

    // Resolved from the JVM's working directory — assumes the app is run
    // from server-kotlin/ (true for `gradle bootRun`/the packaged jar run
    // from that directory, matching every run so far). The Node original
    // resolved this from its own source file location via import.meta.url,
    // which is cwd-independent; this is a known simplification to revisit
    // if this ever needs to run from an arbitrary working directory.
    private val serverRoot = File(".").canonicalFile
    private val harnessesRoot = File(serverRoot, "harnesses")
    val workspacesRoot: File = File(serverRoot, "workspaces")

    // harnessPath is the sole source of a Role's harness — no fallback.
    fun resolveHarnessDir(role: Role): File? {
        val dir = File(role.harnessPath)
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
                BuiltinHarnessResponse(slug = dir.name, title = title, path = dir.path)
            }
            ?: emptyList()
    }
}
