package com.sdlcpaperclip.server.controller

import com.sdlcpaperclip.server.dto.CreateRepositoryRequest
import com.sdlcpaperclip.server.dto.ErrorResponse
import com.sdlcpaperclip.server.dto.UpdateRepositoryRequest
import com.sdlcpaperclip.server.entity.Repository
import com.sdlcpaperclip.server.repository.RepositoryRepository
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.io.File
import java.util.UUID

@RestController
@RequestMapping("/api/projects/{projectId}/repositories")
class RepositoryController(private val repositories: RepositoryRepository) {

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
        val existing = repositories.findById(repositoryId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse("repository not found"))

        val updated = existing.copy(
            name = body.name ?: existing.name,
            localPath = body.localPath ?: existing.localPath,
            defaultBranch = body.defaultBranch ?: existing.defaultBranch,
            gitUrl = body.gitUrl ?: existing.gitUrl,
        )
        return ResponseEntity.ok(repositories.save(updated))
    }
}
