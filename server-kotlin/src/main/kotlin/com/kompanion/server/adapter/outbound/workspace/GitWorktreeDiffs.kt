package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.WorktreeDiffs
import com.kompanion.server.domain.model.RepositoryDiff
import com.kompanion.server.domain.model.Task
import com.kompanion.server.entity.Repository
import com.kompanion.server.repository.RepositoryRepository
import com.kompanion.server.service.RepoWorkspaceService
import org.springframework.stereotype.Component
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

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

    private class GitResult(val exitCode: Int, val output: String)

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

        val truncated = diff.output.length > maxDiffChars
        return result.copy(
            mergeBase = baseSha,
            diff = if (truncated) diff.output.take(maxDiffChars) else diff.output,
            truncated = truncated,
            shortStat = stat.output.trim().ifEmpty { null },
            untrackedFiles = untracked.output.lines().filter { it.isNotBlank() },
        )
    }

    private fun git(dir: File, vararg args: String): GitResult {
        val process = ProcessBuilder(listOf("git", "-C", dir.path) + args)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start()
        // Read before waiting: a diff bigger than the pipe buffer would
        // otherwise block git forever.
        val output = process.inputStream.bufferedReader().readText()
        if (!process.waitFor(30, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            return GitResult(-1, "")
        }
        return GitResult(process.exitValue(), output)
    }
}
