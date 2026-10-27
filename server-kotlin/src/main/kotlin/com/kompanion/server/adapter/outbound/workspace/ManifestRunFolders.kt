package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.RunFolders
import com.kompanion.server.repository.ProjectRepository
import com.kompanion.server.repository.TaskRepository
import com.kompanion.server.repository.TeamRepository
import com.kompanion.server.service.ClaudeHarnessService
import com.kompanion.server.service.WorkspaceManifest
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import java.io.File
import java.util.UUID

// Reads the folders from the task's manifest.json, the file every run writes
// before its CLI starts and the enforcement hook checks tool calls against.
// Leans on the legacy ClaudeHarnessService for the task workspace path, so
// the two can never disagree about where it is.
//
// No manifest means no CLI ever started on this task, so the task workspace
// alone is enough.
@Component
class ManifestRunFolders(
    private val tasks: TaskRepository,
    private val teams: TeamRepository,
    private val projects: ProjectRepository,
    private val harness: ClaudeHarnessService,
    private val objectMapper: ObjectMapper,
) : RunFolders {

    override fun of(taskId: UUID): List<String> {
        val task = tasks.findById(taskId).orElse(null) ?: return emptyList()
        val team = teams.findById(task.teamId).orElse(null) ?: return emptyList()
        val project = projects.findById(team.projectId).orElse(null) ?: return emptyList()
        val taskWorkspace = harness.resolveWorkspaceDir(project, taskId)
        val manifest = File(taskWorkspace, "manifest.json").takeIf { it.isFile }
            ?.let { objectMapper.readValue(it, WorkspaceManifest::class.java) }
        val listed = manifest?.let {
            listOf(it.taskWorkspace, it.primary.workspaceLocalPath) + it.otherRepos.map { repo -> repo.workspaceLocalPath }
        }.orEmpty()
        return (listOf(taskWorkspace.path) + listed).distinct()
    }
}
