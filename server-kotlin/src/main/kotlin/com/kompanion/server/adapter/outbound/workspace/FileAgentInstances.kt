package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.AgentInstances
import com.kompanion.server.application.port.outbound.BuildInstanceRequest
import com.kompanion.server.application.port.outbound.BuiltInstance
import com.kompanion.server.application.port.outbound.LibraryVersion
import com.kompanion.server.domain.model.AgentInstance
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.LoadedSkill
import com.kompanion.server.domain.model.Skill
import com.kompanion.server.domain.model.SkillOutcome
import com.kompanion.server.domain.rule.SkillLayout
import com.kompanion.server.service.ClaudeHarnessService
import org.springframework.stereotype.Component
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.time.OffsetDateTime
import java.util.UUID

// Builds an agent instance and keeps it in WORKSPACE_ROOT/agent-instances/<hash>.
//
// The harness is only ever read, never changed, and the build happens in a
// staging folder: assemble, hash, and move into place only if that hash is
// new. So the store only ever holds complete instances, and two runs with the
// same content share one folder.
@Component
class FileAgentInstances(
    private val claudeHarnessService: ClaudeHarnessService,
    private val libraryVersion: LibraryVersion,
) : AgentInstances {

    private val storeRoot: File get() = File(claudeHarnessService.workspaceRoot, "agent-instances")

    override fun build(request: BuildInstanceRequest): BuiltInstance {
        val harness = claudeHarnessService.resolveLibraryPath(request.harnessPath)
        storeRoot.mkdirs()
        val staging = File(storeRoot, ".staging-${UUID.randomUUID()}").apply { mkdirs() }

        try {
            copyHarness(request.runtime, harness, staging)

            // The folders this instance drew on, for the git question.
            val used = mutableListOf(harness)
            val skills = request.skills.sortedBy { it.slug }.map { addSkill(request.runtime, harness, staging, it, used) }

            val hash = FolderHash.of(staging)
            val stored = File(storeRoot, hash)
            if (!stored.exists()) {
                File(staging, "instance.json").writeText(
                    """{"runtime":"${request.runtime.name}","createdAt":"${OffsetDateTime.now()}"}""" + "\n",
                )
                try {
                    Files.move(staging.toPath(), stored.toPath(), StandardCopyOption.ATOMIC_MOVE)
                } catch (e: IOException) {
                    // Another run stored the same instance a moment ago. Same
                    // hash, same content: theirs is as good as ours.
                    if (!stored.exists()) throw e
                }
            }

            val git = libraryVersion.of(used.map { it.path })
            return BuiltInstance(AgentInstance(hash, skills, git?.sha, git?.dirty), stored.path)
        } finally {
            staging.deleteRecursively()
        }
    }

    // Only what this runtime reads, so a change to another runtime's files in
    // the same harness cannot change the hash.
    private fun copyHarness(runtime: AgentRuntime, harness: File, staging: File) {
        for (entry in SkillLayout.harnessEntries(runtime)) {
            val source = File(harness, entry)
            if (!source.exists()) continue
            // pi's own runtime files may hold credentials and change on their
            // own. They stay out of the store; PiRunner copies them from the
            // harness into the run's config folder, as it always has.
            val exclude: (String) -> Boolean =
                if (entry == "pi-agent") { rel -> rel.substringBefore('/') in SkillLayout.PI_RUNTIME_STATE }
                else { _ -> false }
            copyTree(source, File(staging, entry), exclude)
        }
    }

    private fun addSkill(runtime: AgentRuntime, harness: File, staging: File, skill: Skill, used: MutableList<File>): LoadedSkill {
        val source = claudeHarnessService.resolveLibraryPath(skill.skillPath)
        if (!source.isDirectory) return LoadedSkill(skill.slug, null, SkillOutcome.missing)

        used += source
        val hash = FolderHash.of(source)

        // The harness wins: a skill it already carries is not replaced.
        val harnessHasIt = SkillLayout.harnessSkillDirs(runtime).any { File(File(harness, it), skill.slug).isDirectory }
        if (harnessHasIt) return LoadedSkill(skill.slug, hash, SkillOutcome.skipped_harness_has_it)

        copyTree(source, File(staging, "${SkillLayout.libraryDir(runtime)}/${skill.slug}"))
        return LoadedSkill(skill.slug, hash, SkillOutcome.loaded)
    }

    // Copies a file or a folder, keeping permissions (a skill's script keeps
    // its executable bit). exclude gets each path relative to the source, with
    // "/" separators.
    private fun copyTree(source: File, target: File, exclude: (String) -> Boolean = { false }) {
        if (source.isFile) {
            target.parentFile.mkdirs()
            Files.copy(source.toPath(), target.toPath(), StandardCopyOption.COPY_ATTRIBUTES)
            return
        }
        val root = source.toPath()
        Files.walk(root).use { stream ->
            stream.forEach { path ->
                val relative = root.relativize(path).joinToString("/")
                if (relative.isNotEmpty() && exclude(relative)) return@forEach
                val destination = target.toPath().resolve(relative)
                if (Files.isDirectory(path)) {
                    Files.createDirectories(destination)
                } else {
                    Files.createDirectories(destination.parent)
                    Files.copy(path, destination, StandardCopyOption.COPY_ATTRIBUTES)
                }
            }
        }
    }
}
