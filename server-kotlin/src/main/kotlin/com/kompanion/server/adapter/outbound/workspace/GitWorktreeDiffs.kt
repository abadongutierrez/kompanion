package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.WorktreeDiffs
import com.kompanion.server.domain.model.RepositoryDiff
import com.kompanion.server.domain.model.Task
import com.kompanion.server.entity.Repository
import com.kompanion.server.repository.RepositoryRepository
import com.kompanion.server.service.RepoWorkspaceService
import org.springframework.stereotype.Component
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

// Shells out to git in each worktree. Leans on the legacy
// RepoWorkspaceService for the worktree path and branch name, so the two can
// never disagree about where a task's worktree is.
@Component
class GitWorktreeDiffs(
    private val repositories: RepositoryRepository,
    private val repoWorkspace: RepoWorkspaceService,
) : WorktreeDiffs {

    // A large generated file can make a diff huge; the UI only needs enough
    // to read, so cap what goes over the wire and say so.
    private val maxDiffChars = 1_000_000

    internal class GitResult(val exitCode: Int, val output: String, val truncated: Boolean = false)

    override fun diffsFor(task: Task, repositoryIds: List<UUID>): List<RepositoryDiff> =
        repositories.findAllById(repositoryIds)
            .sortedBy { it.name }
            .map { diff(task, it) }

    internal fun diff(task: Task, repo: Repository): RepositoryDiff {
        val taskId = task.id!!
        val worktreeDir = repoWorkspace.resolveRepoWorktreeDir(repo.localPath, taskId, task.title)
        val result = RepositoryDiff(
            repositoryId = repo.id!!,
            repositoryName = repo.name,
            baseBranch = repo.defaultBranch,
            branch = repoWorkspace.taskBranchName(taskId, task.title, task.type),
            worktreeExists = worktreeDir.isDirectory,
        )
        if (!worktreeDir.isDirectory) return result

        // Against the merge base, not the base branch tip: commits that land
        // on the base branch after the worktree was cut are not this task's
        // changes. Diffing one commit against the working tree (no second
        // ref) covers committed and uncommitted edits alike.
        val mergeBase = git(worktreeDir, "merge-base", repo.defaultBranch, "HEAD")
        if (mergeBase.exitCode != 0) {
            return result.copy(error = "could not find a merge base with ${repo.defaultBranch}")
        }
        val baseSha = mergeBase.output.trim()

        val diff = git(worktreeDir, "diff", "--no-color", "--no-ext-diff", baseSha)
        if (diff.exitCode != 0) return result.copy(mergeBase = baseSha, error = "git diff failed")

        val stat = git(worktreeDir, "diff", "--shortstat", baseSha)
        val untracked = git(worktreeDir, "ls-files", "--others", "--exclude-standard")

        return result.copy(
            mergeBase = baseSha,
            diff = diff.output,
            truncated = diff.truncated,
            shortStat = stat.output.trim().ifEmpty { null },
            untrackedFiles = untracked.output.lines().filter { it.isNotBlank() },
        )
    }

    private fun git(dir: File, vararg args: String): GitResult =
        runBounded(listOf("git", "-C", dir.path) + args, maxDiffChars, 30, TimeUnit.SECONDS)

    internal companion object {
        // Output is read on its own thread, so the timeout holds even when
        // the process stalls without writing, and stops at maxChars, so a
        // huge diff is never buffered whole. Past the cap the process is
        // killed; that's a truncated success, not a failure.
        internal fun runBounded(command: List<String>, maxChars: Int, timeout: Long, unit: TimeUnit): GitResult {
            val process = ProcessBuilder(command)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start()
            val output = StringBuilder()
            var truncated = false
            val reader = thread(isDaemon = true, name = "git-output") {
                process.inputStream.bufferedReader().use { r ->
                    val chunk = CharArray(8192)
                    while (true) {
                        val n = try { r.read(chunk) } catch (e: IOException) { -1 }
                        if (n < 0) break
                        val room = maxChars - output.length
                        if (n > room) {
                            output.appendRange(chunk, 0, room)
                            truncated = true
                            process.destroyForcibly()
                            break
                        }
                        output.appendRange(chunk, 0, n)
                    }
                }
            }
            if (!process.waitFor(timeout, unit)) {
                process.destroyForcibly()
                reader.join(1000)
                return GitResult(-1, "")
            }
            reader.join()
            if (truncated) return GitResult(0, output.toString(), truncated = true)
            return GitResult(process.exitValue(), output.toString())
        }
    }
}
