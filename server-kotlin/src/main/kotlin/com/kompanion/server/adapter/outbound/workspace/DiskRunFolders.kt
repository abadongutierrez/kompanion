package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.RunFolders
import com.kompanion.server.repository.ProjectRepository
import com.kompanion.server.repository.RepositoryRepository
import com.kompanion.server.repository.TaskRepository
import com.kompanion.server.repository.TeamRepository
import com.kompanion.server.service.ClaudeHarnessService
import org.springframework.stereotype.Component
import java.io.File
import java.io.IOException
import java.util.UUID

// Looks on disk rather than at what a run recorded, so it works for every
// runtime (the opencode ones write no manifest.json) and for runs that
// crashed before recording anything: the task workspace, and every worktree
// of this task in any of the project's repositories.
//
// A worktree is <repo>/.worktrees/<taskId>-<title slug> (RepoWorkspaceService).
// Matching on the task id alone also finds one named after an older title,
// or in a repository unlinked from the task since.
//
// Leans on the legacy ClaudeHarnessService for the task workspace path, so
// the two can never disagree about where it is.
@Component
class DiskRunFolders(
    private val tasks: TaskRepository,
    private val teams: TeamRepository,
    private val projects: ProjectRepository,
    private val repositories: RepositoryRepository,
    private val harness: ClaudeHarnessService,
) : RunFolders {

    override fun of(taskId: UUID): List<String> {
        val task = tasks.findById(taskId).orElseThrow { IllegalStateException("task $taskId not found") }
        val team = teams.findById(task.teamId).orElseThrow { IllegalStateException("team ${task.teamId} not found") }
        val project = projects.findById(team.projectId)
            .orElseThrow { IllegalStateException("project ${team.projectId} not found") }

        val taskWorkspace = harness.resolveWorkspaceDir(project, taskId)
        val worktrees = repositories.findByProjectIdOrderByCreatedAt(project.id!!).flatMap { repo ->
            val root = File(repo.localPath, ".worktrees")
            if (!root.exists()) return@flatMap emptyList()
            // null for a folder that is there but cannot be listed: the
            // task's worktree may be in it, so this is a failure, not "none".
            root.listFiles { f -> f.isDirectory && f.name.startsWith("$taskId-") }?.toList()
                ?: throw IOException("cannot list $root")
        }
        return (listOf(taskWorkspace) + worktrees).map { it.path }.distinct()
    }
}
