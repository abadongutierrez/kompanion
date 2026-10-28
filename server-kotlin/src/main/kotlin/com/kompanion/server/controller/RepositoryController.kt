package com.kompanion.server.controller

import com.kompanion.server.dto.CreateRepositoryRequest
import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.UpdateRepositoryRequest
import com.kompanion.server.entity.Repository
import com.kompanion.server.repository.RepositoryRepository
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.bind.annotation.*
import java.io.File
import java.util.UUID

@RestController
@RequestMapping("/api/projects/{projectId}/repositories")
class RepositoryController(
    private val repositories: RepositoryRepository,
    txManager: PlatformTransactionManager,
) {

    private val tx = TransactionTemplate(txManager)

    // No cloning happens here — the operator is expected to have already
    // cloned the repo to localPath. We only validate it's really there.
    // Also requires at least one commit: `git worktree add -b <branch>
    // <base>` fails on a repo with zero commits ("invalid reference"), and
    // that failure otherwise only surfaces much later, at run time, as an
    // opaque 500 — much easier to catch and explain right when the repo is
    // registered.
    private fun validateLocalPath(localPath: String): String? {
        val dir = File(localPath)
        if (!dir.exists()) {
            return "no directory at \"$localPath\" — clone the repo there first, then register it"
        }
        if (!File(dir, ".git").exists()) {
            return "\"$localPath\" exists but isn't a git repository (no .git found)"
        }
        val exitCode = try {
            ProcessBuilder("git", "-C", localPath, "rev-parse", "HEAD")
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start()
                .waitFor()
        } catch (e: Exception) {
            1
        }
        if (exitCode != 0) {
            return "\"$localPath\" has no commits yet — make an initial commit before registering it (worktrees need a real branch to base off of)"
        }
        return null
    }

    @GetMapping
    fun list(@PathVariable projectId: UUID): List<Repository> =
        repositories.findByProjectIdOrderByCreatedAt(projectId)

    @PostMapping
    fun create(
        @PathVariable projectId: UUID,
        @RequestBody body: CreateRepositoryRequest,
    ): ResponseEntity<Any> {
        validateLocalPath(body.localPath)?.let {
            return ResponseEntity.badRequest().body(ErrorResponse(it))
        }
        // createdAt is @ReadOnlyProperty (DB default now()) — re-fetch to
        // return the fully populated row, matching `returning *`.
        val saved = repositories.save(
            Repository(
                projectId = projectId,
                name = body.name,
                localPath = body.localPath,
                defaultBranch = body.defaultBranch ?: "main",
                gitUrl = body.gitUrl,
            ),
        )
        val reloaded = repositories.findById(saved.id!!).orElse(saved)
        return ResponseEntity.status(HttpStatus.CREATED).body(reloaded)
    }

    @PatchMapping("/{repositoryId}")
    fun update(
        @PathVariable projectId: UUID,
        @PathVariable repositoryId: UUID,
        @RequestBody body: UpdateRepositoryRequest,
    ): ResponseEntity<Any> {
        body.localPath?.let { path ->
            validateLocalPath(path)?.let {
                return ResponseEntity.badRequest().body(ErrorResponse(it))
            }
        }
        val found = repositories.findById(repositoryId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse("repository not found"))

        return tx.execute {
            // A run's worktree sits under the repository's path, and after a
            // crash the next boot looks for the run's leftover processes
            // there (DiskRunFolders). Moving the path mid-run would hide
            // them. The project lock makes the check and the save one step
            // against RunTaskService's claim, which takes the same lock: a
            // claim either lands first and is seen here, or waits until the
            // new path is saved and its run reads that one.
            repositories.lockProject(found.projectId)
            val existing = repositories.findById(repositoryId).orElse(found)
            if (body.localPath != null && body.localPath != existing.localPath &&
                repositories.projectHasRunningTask(existing.projectId)
            ) {
                return@execute ResponseEntity.status(HttpStatus.CONFLICT)
                    .body<Any>(ErrorResponse("a task in this project is running; change the local path once no run is in progress"))
            }

            val updated = existing.copy(
                name = body.name ?: existing.name,
                localPath = body.localPath ?: existing.localPath,
                defaultBranch = body.defaultBranch ?: existing.defaultBranch,
                gitUrl = body.gitUrl ?: existing.gitUrl,
            )
            ResponseEntity.ok<Any>(repositories.save(updated))
        }!!
    }
}
