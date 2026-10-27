package com.kompanion.server.domain.model

import java.time.OffsetDateTime
import java.util.UUID

// An installed agent CLI and how to launch it. Not the same thing as
// AgentRuntime, which is only the kind: this is one configured instance of a
// kind, so there can be two Claude Code runtimes pointing at different
// config directories.
data class Runtime(
    val id: UUID? = null,
    // Unique app-wide, case-insensitively. What the operator picks from.
    val name: String,
    val kind: AgentRuntime,
    // null means the kind's default: its *_BIN env var, then PATH.
    val binaryPath: String? = null,
    // claude_code only: handed to the CLI as CLAUDE_CONFIG_DIR, so each
    // runtime can be signed in to a different account. A leading "~/" is
    // expanded when the runtime is used, not when it is stored.
    val configDir: String? = null,
    val createdAt: OffsetDateTime? = null,
) {
    fun resolvedConfigDir(home: String = System.getProperty("user.home")): String? =
        configDir?.let {
            when {
                it == "~" -> home
                it.startsWith("~/") -> home + it.substring(1)
                else -> it
            }
        }
}
