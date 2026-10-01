package com.kompanion.server.domain.rule

import com.kompanion.server.domain.model.AgentRuntime

// Where each runtime looks for things, as folder names inside an agent
// instance. Pure strings: the adapter that builds an instance turns them into
// files, and the runners turn the instance into a working directory.
//
// The instance holds only what its own runtime reads, so a change to another
// runtime's files in the same harness does not change its hash.
object SkillLayout {

    // The slug of a skill: the folder name. Also what the runtimes call it,
    // which is why the SKILL.md name must match it.
    val SLUG = Regex("^[a-z0-9]+(-[a-z0-9]+)*$")

    // Where a library skill is placed inside the instance.
    fun libraryDir(runtime: AgentRuntime): String = when (runtime) {
        AgentRuntime.claude_code -> ".claude/skills"
        // pi reads skills from a folder it is handed with --skill, so the
        // runner passes this one.
        AgentRuntime.pi -> ".pi/skills"
        // opencode also reads .claude/ and .agents/, but .opencode/ is the
        // folder its runner already owns and rebuilds every run.
        AgentRuntime.opencode -> ".opencode/skills"
    }

    // Folders in the harness where it may already carry skills of its own.
    // A library skill with the same slug in any of them loses (harness wins).
    fun harnessSkillDirs(runtime: AgentRuntime): List<String> = when (runtime) {
        AgentRuntime.claude_code -> listOf(".claude/skills")
        AgentRuntime.pi -> listOf(".pi/skills", ".claude/skills")
        AgentRuntime.opencode -> listOf(".opencode/skills", ".opencode/skill")
    }

    // What of the harness goes into the instance. Both system-prompt files are
    // listed for the runtimes that fall back from one to the other.
    fun harnessEntries(runtime: AgentRuntime): List<String> = when (runtime) {
        AgentRuntime.claude_code -> listOf("CLAUDE.md", ".claude")
        AgentRuntime.pi -> listOf("AGENTS.md", "CLAUDE.md", "pi-agent", ".pi/skills", ".claude/skills")
        AgentRuntime.opencode -> listOf("AGENTS.md", "CLAUDE.md", ".opencode")
    }

    // pi writes these into whatever config folder it is pointed at. They may
    // hold credentials and they change on their own, so they never go into a
    // stored instance. The runner still copies them from the harness into the
    // run's config folder, as it always has.
    val PI_RUNTIME_STATE = listOf("auth.json", "models-store.json", "trust.json", "sessions", "npm")
}
