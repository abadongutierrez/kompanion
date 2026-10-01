package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.AgentRuntime

// The filesystem half of the skills library: reading a skill folder, finding
// the ones in the library, and asking whether a harness already carries a
// skill. Paths are the stored form — absolute, or relative to the library
// root — and resolving them is this port's job.
interface SkillFiles {

    // Reads a skill folder. A skill is valid when the folder exists and its
    // SKILL.md has a name matching the folder name and a description.
    fun inspect(path: String): SkillInspection

    // The stored form of a path: relative to the library root when it is
    // inside it, otherwise as given.
    fun normalizePath(path: String): String

    // Stored paths of every folder directly under the library's skills/
    // folder, valid or not.
    fun libraryFolders(): List<String>

    // The SKILL.md text, or null when the folder or file is gone.
    fun readBody(path: String): String?

    // True when the harness already has a skill with this slug in a folder the
    // runtime reads. Used to say "the harness would win".
    fun harnessHasSkill(runtime: AgentRuntime, harnessPath: String, slug: String): Boolean
}

sealed interface SkillInspection {
    data class Valid(
        val slug: String,
        val name: String,
        val description: String,
        // Hash of the whole folder, so a changed script shows up too.
        val hash: String,
    ) : SkillInspection

    data class Problem(val message: String) : SkillInspection
}
