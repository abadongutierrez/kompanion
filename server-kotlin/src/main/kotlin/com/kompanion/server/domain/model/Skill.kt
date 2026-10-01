package com.kompanion.server.domain.model

import java.time.OffsetDateTime
import java.util.UUID

// A skill is a folder on disk (SKILL.md plus files); this is the row that
// points at it. name and description are cached from the SKILL.md frontmatter
// so a list does not have to read the disk — a scan refreshes them.
data class Skill(
    val id: UUID? = null,
    // The folder name. Lowercase letters, digits and dashes, unique app-wide.
    val slug: String,
    val name: String,
    val description: String,
    // Absolute, or relative to the library root. Resolving it is an
    // adapter's job — the domain only knows there is one.
    val skillPath: String,
    val createdAt: OffsetDateTime? = null,
)

// What became of one assigned skill when a run was built.
enum class SkillOutcome {
    // Built into the agent instance.
    loaded,

    // The harness already had a skill with this slug, and the harness wins.
    skipped_harness_has_it,

    // The folder was gone at run time. The run goes on without it.
    missing,
}

// One assigned skill as a run saw it. hash is null when the folder was
// missing, because there was nothing to hash.
data class LoadedSkill(
    val slug: String,
    val hash: String?,
    val outcome: SkillOutcome,
)

// What a run was built from: the hash that names the stored instance, the
// skills it carried, and which commit of the library it came from. gitSha and
// gitDirty are null when the library is not inside a git repo.
data class AgentInstance(
    val hash: String,
    val skills: List<LoadedSkill>,
    val gitSha: String?,
    val gitDirty: Boolean?,
)
