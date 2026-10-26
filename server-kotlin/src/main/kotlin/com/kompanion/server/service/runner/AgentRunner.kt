package com.kompanion.server.service.runner

import com.kompanion.server.entity.Agent
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.service.WorkspaceManifest
import java.io.File
import java.math.BigDecimal
import java.util.UUID

// Everything a runner needs to know about the run it is about to start.
// Bundled rather than passed as eight parameters, because each runner uses a
// different subset — Claude Code reads the harness CLAUDE.md for
// --append-system-prompt, opencode instead materializes an agent file into
// the workspace and never uses the flag.
data class RunContext(
    val agent: Agent,
    val prompt: String,
    // The harness template directory, already resolved from the Agent's
    // (possibly relative) harnessPath.
    val harnessDir: File,
    // The stored agent instance for this run: the harness plus the Agent's
    // skills, laid out for this runtime and hashed. Runners build their
    // working directory from it and read the system prompt from it, so what
    // ran is exactly what was stored. harnessDir stays for the one thing that
    // is deliberately not in the instance — see PiRunner.
    val instanceDir: File,
    // Where the CLI runs: a real git worktree once repos are linked,
    // otherwise the task's scratch workspace.
    val cwdDir: File,
    // Always the task's own folder under workspace/tasks/, even when cwdDir
    // is a repo worktree — manifest.json and the logs live here, never inside
    // the repository being worked on.
    val taskWorkspaceDir: File,
    val taskId: UUID,
    // What is left of the team's monthly budget, or null when the team has no
    // budget set. A runner whose CLI can enforce a ceiling should pass it on;
    // the pre-flight check in RunTaskService only catches "already over", and
    // without this one run can spend past the remainder.
    val remainingBudgetUsd: BigDecimal?,
    // Set when this run continues an earlier run's CLI session instead of
    // starting a new one. `prompt` is then the operator's follow-up, not the
    // task prompt — the session already has that.
    val resume: ResumeContext? = null,
)

data class ResumeContext(
    // The CLI's own session id, as recorded on the earlier run.
    val sessionId: String,
    // The earlier run's raw_output, as the runner itself produced it. A CLI
    // that reports a session-cumulative cost (Claude Code does) needs the
    // last reported total to work out what this run alone spent.
    val previousRawOutput: Any?,
)

// Kept apart rather than summed: cache reads bill at 0.1x input and cache
// writes at 1.25x, and on Claude Code `input` alone counts only what wasn't
// served from cache — a few dozen tokens against hundreds of thousands read.
// Anything displaying an input total has to add all three.
data class TokenUsage(
    val input: Long?,
    val output: Long?,
    val cacheRead: Long?,
    val cacheWrite: Long?,
) {
    companion object {
        val NONE = TokenUsage(null, null, null, null)
    }
}

// What a runner makes of a finished process: everything that lands on the
// task_runs row apart from durationMs, which is wall-clock and measured by
// the caller.
data class Interpretation(
    val ok: Boolean,
    val summary: String?,
    val rawOutput: Any?,
    val costUsd: BigDecimal?,
    val tokens: TokenUsage = TokenUsage.NONE,
)

// The seam between orchestration and CLI. RunTaskService owns everything
// runtime-agnostic — the budget gate, worktrees, the manifest, status
// transitions, persisting events, the SSE relay, the timeout — and a runner
// owns only the four things that genuinely differ per CLI: what a valid
// harness looks like, what gets materialized into the workspace, the command
// line, and how to read the resulting event stream.
interface AgentRunner {
    val runtime: AgentRuntime

    // null when the directory is a usable harness for this runtime; otherwise
    // an operator-facing reason. Called at Agent create/edit time, not at run
    // time, so a bad pairing is reported while it can still be fixed.
    fun validateHarness(harnessDir: File): String?

    // Copy/write whatever the CLI expects to find before it starts. Runs on
    // every run and must be idempotent: the workspace survives across runs and
    // across agent handoffs, and the previous agent's config has to be
    // replaced rather than merged into.
    fun prepareWorkspace(ctx: RunContext, manifest: WorkspaceManifest)

    // argv, never a shell string — task-supplied text becomes prompt content
    // and must never be shell-interpreted.
    fun buildCommand(ctx: RunContext): List<String>

    // Extra environment for the CLI process, on top of the TASK_ID /
    // TASK_WORKSPACE_DIR the caller always sets. Empty for the two runtimes
    // that configure themselves entirely through flags and files; pi needs it
    // because its provider catalogue (LM Studio and friends) is only readable
    // from a config directory named by PI_CODING_AGENT_DIR.
    fun environment(ctx: RunContext): Map<String, String> = emptyMap()

    // `events` is every JSON line the CLI wrote to stdout, in order. Empty
    // when it produced none, which is itself a failure signal worth
    // reporting rather than treating as an empty success.
    fun interpret(events: List<Map<String, Any?>>, exitCode: Int, stderr: String): Interpretation

    // The same, with the run's context — what a resumed run needs, since its
    // cost may have to be read against the session's earlier total. Runners
    // that cannot resume never see a resume and can leave this alone.
    fun interpret(ctx: RunContext, events: List<Map<String, Any?>>, exitCode: Int, stderr: String): Interpretation =
        interpret(events, exitCode, stderr)

    // -- Resume -------------------------------------------------------------
    //
    // Continuing a finished run's CLI session with a follow-up. Off by
    // default: a runtime opts in by overriding all of the below. Claude Code
    // does; pi and opencode have sessions too, and can join later through
    // this same seam.

    val supportsResume: Boolean get() = false

    // The CLI's session id, if this streamed event carries it. Called on every
    // event until one returns non-null; the id is then stored on the run.
    fun sessionIdFrom(event: Map<String, Any?>): String? = null

    // Where this CLI keeps its sessions for the server's current user and
    // environment. Recorded on each run, and compared at resume time: a
    // session written under one config directory cannot be found from
    // another.
    fun sessionStore(): String? = null

    // null when `sessionId` can be resumed from `store`; otherwise an
    // operator-facing reason (typically: the session file is gone). Checked
    // just before the CLI starts, so a missing session fails the run clearly
    // instead of quietly opening a blank one.
    fun resumeProblem(sessionId: String, store: String): String? = null
}
