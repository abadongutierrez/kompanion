package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.application.port.outbound.Harnesses
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.service.ClaudeHarnessService
import com.kompanion.server.service.runner.AgentRunner
import org.springframework.stereotype.Component

// The filesystem half of the Harnesses port. What counts as a valid harness
// depends on the runtime — .claude/ for Claude Code, .opencode/ or AGENTS.md
// for opencode, AGENTS.md or pi-agent/ for pi — and each runner already
// answers that for its own CLI, so this asks rather than restating it.
// Adding a runtime stays a matter of adding a @Component.
@Component
class FileHarnesses(
    private val claudeHarnessService: ClaudeHarnessService,
    runnerList: List<AgentRunner>,
) : Harnesses {

    private val runners: Map<AgentRuntime, AgentRunner> = runnerList.associateBy { it.runtime }

    override fun normalizePath(path: String): String = claudeHarnessService.toStoredPath(path)

    override fun validate(runtime: AgentRuntime, path: String): String? {
        val dir = claudeHarnessService.resolveHarnessPath(path)
        if (!dir.exists()) {
            return "no directory at \"${dir.path}\" — create the harness there first, then register it"
        }
        val runner = runners[runtime] ?: return "no runner registered for runtime $runtime"
        return runner.validateHarness(dir)
    }
}
