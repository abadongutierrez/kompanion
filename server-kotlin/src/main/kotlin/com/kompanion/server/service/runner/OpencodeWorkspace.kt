package com.kompanion.server.service.runner

import java.io.File

// What opencode v1 and v2 share: the harness layout and the way the system
// prompt reaches the CLI. Only the command line and the event stream differ,
// so OpencodeRunner and Opencode2Runner each own those and delegate here.
object OpencodeWorkspace {

    // The name of the agent definition written into the workspace and passed
    // to --agent. Fixed rather than derived from the Agent's slug: it names a
    // file we own inside a directory we rewrite each run, so a stable name
    // keeps prepareWorkspace idempotent.
    const val AGENT_NAME = "kompanion"

    fun validateHarness(harnessDir: File): String? =
        if (File(harnessDir, ".opencode").exists() || File(harnessDir, "AGENTS.md").exists()) null
        else "\"${harnessDir.path}\" exists but has neither .opencode/ nor AGENTS.md — it isn't a valid opencode harness"

    // opencode has no --append-system-prompt: a system prompt reaches it only
    // as an agent definition on disk, selected by --agent. So unlike the
    // Claude path — which passes CLAUDE.md as a flag precisely so it can
    // never clobber a real repository's own file — this one has to write into
    // the working directory. It goes under .opencode/agents/, which is ours,
    // rather than at AGENTS.md in the repo root, which would overwrite the
    // project's own.
    fun prepare(ctx: RunContext) {
        ctx.cwdDir.mkdirs()

        val destOpencode = File(ctx.cwdDir, ".opencode")
        destOpencode.deleteRecursively()
        File(ctx.instanceDir, ".opencode").takeIf { it.exists() }
            ?.copyRecursively(destOpencode, overwrite = true)

        val agentsDir = File(destOpencode, "agents")
        agentsDir.mkdirs()
        File(agentsDir, "$AGENT_NAME.md").writeText(buildAgentDefinition(ctx))
    }

    // AGENTS.md is opencode's own convention; CLAUDE.md is the fallback so a
    // harness written for Claude Code still carries its framing across
    // without being duplicated.
    private fun buildAgentDefinition(ctx: RunContext): String {
        val body = listOf("AGENTS.md", "CLAUDE.md")
            .map { File(ctx.instanceDir, it) }
            .firstOrNull { it.exists() }
            ?.readText()
            .orEmpty()

        return buildString {
            appendLine("---")
            appendLine("description: ${ctx.agent.title}, running a Kompanion task")
            appendLine("mode: primary")
            appendLine("---")
            appendLine()
            append(body)
        }
    }
}
