package com.kompanion.server.service

import com.kompanion.server.entity.Repository
import com.kompanion.server.entity.Task
import com.kompanion.server.domain.model.TaskType
import org.springframework.stereotype.Service
import java.io.File

data class RepoWorktree(val repo: Repository, val worktreeDir: File)

@Service
class RepoWorkspaceService {

    private val branchPrefixByType = mapOf(
        TaskType.bug to "fix",
        TaskType.story to "feat",
        TaskType.chore to "chore",
        TaskType.spike to "spike",
    )

    private fun slugify(text: String): String =
        text.lowercase()
            .replace(Regex("[^a-z0-9]+"), "-")
            .replace(Regex("(^-|-$)"), "")
            .take(40)

    fun taskBranchName(task: Task): String {
        val prefix = branchPrefixByType[task.type] ?: "task"
        return "$prefix/${task.id}-${slugify(task.title)}"
    }

    // Deliberately inside the repo's own directory, not our app's internal
    // folder — actual implementation work (worktree creation, file edits,
    // commits) must happen at the repository's own configured location.
    // Hidden so it doesn't clutter a normal directory listing; still needs
    // excluding from git's own view (see ensureRepoExcludes) since it sits
    // inside a tracked working tree.
    fun resolveRepoWorktreeDir(repo: Repository, task: Task): File =
        File(File(repo.localPath, ".worktrees"), "${task.id}-${slugify(task.title)}")

    // Idempotent: appends each pattern to the repo's shared .git/info/exclude
    // (not the project's own tracked .gitignore) only if not already
    // present, so `git status`/`git add -A` never surface our
    // worktree/harness dirs as clutter in either the main clone or any of
    // its worktrees (info/exclude is shared across all of a repo's
    // worktrees via the common git dir).
    fun ensureRepoExcludes(repo: Repository) {
        val excludeFile = File(File(File(repo.localPath, ".git"), "info"), "exclude")
        val patterns = listOf(".worktrees/", ".claude/")
        val existing = if (excludeFile.exists()) excludeFile.readText() else ""
        val existingLines = existing.split("\n").map { it.trim() }.toSet()
        val missing = patterns.filter { it !in existingLines }
        if (missing.isEmpty()) return

        excludeFile.parentFile.mkdirs()
        val separator = if (existing.isNotEmpty() && !existing.endsWith("\n")) "\n" else ""
        excludeFile.writeText(existing + separator + missing.joinToString("\n") + "\n")
    }

    // Idempotent per repo: if a repo's worktree already exists, reuse it
    // as-is — a Task re-run or an agent handoff (Engineer -> QA -> PM) must
    // land in the same branch/directory, not a fresh one each time.
    fun ensureWorktrees(task: Task, repos: List<Repository>): List<RepoWorktree> {
        val branchName = taskBranchName(task)

        return repos.map { repo ->
            ensureRepoExcludes(repo)
            val worktreeDir = resolveRepoWorktreeDir(repo, task)

            if (!worktreeDir.exists()) {
                File(repo.localPath, ".worktrees").mkdirs()
                val process = ProcessBuilder(
                    "git", "-C", repo.localPath, "worktree", "add",
                    worktreeDir.path, "-b", branchName, repo.defaultBranch,
                )
                    .redirectErrorStream(true)
                    .start()
                val output = process.inputStream.bufferedReader().readText()
                val exitCode = process.waitFor()
                if (exitCode != 0) {
                    throw RuntimeException("git worktree add failed: $output")
                }
            }

            RepoWorktree(repo, worktreeDir)
        }
    }
}
