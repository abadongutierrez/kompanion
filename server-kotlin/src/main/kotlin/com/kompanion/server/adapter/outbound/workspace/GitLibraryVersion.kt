package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.GitState
import com.kompanion.server.application.port.outbound.LibraryVersion
import com.kompanion.server.service.ClaudeHarnessService
import org.springframework.stereotype.Component
import java.io.File
import java.util.concurrent.TimeUnit

// Asks git which commit the library is at and whether the folders a run used
// have uncommitted changes. git is run with an argv array, like every other
// process here, and anything that goes wrong — no git, not a repo, no commits
// yet — is "unknown" (null), never an error: a run must not fail because the
// library is not under version control.
@Component
class GitLibraryVersion(
    private val claudeHarnessService: ClaudeHarnessService,
) : LibraryVersion {

    override fun of(paths: List<String>): GitState? {
        val root = claudeHarnessService.libraryRoot
        if (!root.isDirectory) return null

        val top = git(root, "rev-parse", "--show-toplevel")?.let { File(it).canonicalFile } ?: return null
        val sha = git(root, "rev-parse", "HEAD") ?: return null

        // Only paths inside this repo can be asked about. A skill kept
        // somewhere else on disk is covered by its own hash, not by git.
        val inside = paths.map { File(it).canonicalFile }
            .filter { it == top || it.path.startsWith(top.path + File.separator) }
        val dirty = if (inside.isEmpty()) {
            false
        } else {
            (git(root, listOf("status", "--porcelain", "--") + inside.map { it.path }) ?: return null).isNotBlank()
        }
        return GitState(sha, dirty)
    }

    private fun git(dir: File, vararg args: String): String? = git(dir, args.toList())

    // stdout trimmed, or null on any failure. An empty answer is a real answer
    // (a clean status), so it stays "" rather than null.
    private fun git(dir: File, args: List<String>): String? = try {
        val process = ProcessBuilder(listOf("git", "-C", dir.path) + args)
            .redirectErrorStream(false)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start()
        val out = process.inputStream.bufferedReader().readText()
        if (!process.waitFor(10, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            null
        } else if (process.exitValue() != 0) {
            null
        } else {
            out.trim()
        }
    } catch (e: java.io.IOException) {
        null
    }
}
