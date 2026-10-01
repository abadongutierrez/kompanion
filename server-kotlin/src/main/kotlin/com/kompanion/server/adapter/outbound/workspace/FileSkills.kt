package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.SkillFiles
import com.kompanion.server.application.port.outbound.SkillInspection
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.rule.SkillLayout
import com.kompanion.server.service.ClaudeHarnessService
import org.springframework.stereotype.Component
import java.io.File

// The filesystem half of the skills library. Paths follow the same rule an
// Agent's harnessPath does — absolute, or relative to the library root — so
// ClaudeHarnessService does the resolving.
@Component
class FileSkills(
    private val claudeHarnessService: ClaudeHarnessService,
) : SkillFiles {

    private val skillsRoot: File get() = File(claudeHarnessService.libraryRoot, "skills")

    override fun inspect(path: String): SkillInspection {
        val dir = claudeHarnessService.resolveLibraryPath(path)
        if (!dir.isDirectory) return SkillInspection.Problem("no folder at \"${dir.path}\"")

        val slug = dir.name
        if (!SkillLayout.SLUG.matches(slug)) {
            return SkillInspection.Problem(
                "the folder name \"$slug\" must be lowercase letters, digits and dashes (it becomes the skill's slug)",
            )
        }

        val skillMd = File(dir, "SKILL.md")
        if (!skillMd.isFile) return SkillInspection.Problem("\"${dir.path}\" has no SKILL.md")

        val front = SkillFrontmatter.parse(skillMd.readText())
            ?: return SkillInspection.Problem("SKILL.md has no frontmatter block (--- … ---) with a name and a description")

        val name = front["name"]?.takeIf { it.isNotBlank() }
            ?: return SkillInspection.Problem("SKILL.md frontmatter has no name")
        if (name != slug) {
            return SkillInspection.Problem(
                "SKILL.md name \"$name\" must match the folder name \"$slug\" — the runtimes load a skill by that name",
            )
        }
        val description = front["description"]?.takeIf { it.isNotBlank() }
            ?: return SkillInspection.Problem("SKILL.md frontmatter has no description")

        return SkillInspection.Valid(slug, name, description, FolderHash.of(dir))
    }

    override fun normalizePath(path: String): String = claudeHarnessService.toStoredLibraryPath(path)

    override fun libraryFolders(): List<String> =
        skillsRoot.listFiles { f -> f.isDirectory && !f.name.startsWith(".") }
            ?.sortedBy { it.name }
            ?.map { normalizePath(it.path) }
            ?: emptyList()

    override fun readBody(path: String): String? =
        File(claudeHarnessService.resolveLibraryPath(path), "SKILL.md").takeIf { it.isFile }?.readText()

    override fun harnessHasSkill(runtime: AgentRuntime, harnessPath: String, slug: String): Boolean {
        val harness = claudeHarnessService.resolveLibraryPath(harnessPath)
        return SkillLayout.harnessSkillDirs(runtime).any { File(File(harness, it), slug).isDirectory }
    }
}
