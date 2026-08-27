package com.kompanion.server.service.runner

import com.kompanion.server.entity.Agent
import com.kompanion.server.entity.AgentRuntime
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
)

// What a runner makes of a finished process: everything that lands on the
// task_runs row apart from durationMs, which is wall-clock and measured by
// the caller.
data class Interpretation(
    val ok: Boolean,
    val summary: String?,
    val rawOutput: Any?,
    val costUsd: BigDecimal?,
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

    // `events` is every JSON line the CLI wrote to stdout, in order. Empty
    // when it produced none, which is itself a failure signal worth
    // reporting rather than treating as an empty success.
    fun interpret(events: List<Map<String, Any?>>, exitCode: Int, stderr: String): Interpretation
}
