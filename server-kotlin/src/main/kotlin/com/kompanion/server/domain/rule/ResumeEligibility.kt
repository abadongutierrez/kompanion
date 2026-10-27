package com.kompanion.server.domain.rule

import java.util.UUID

// Whether a finished run's CLI session can be continued with a follow-up.
// Pure: the caller gathers the facts (the run, the task, what the Agent would
// be built from right now) and this decides.
//
// A resume replays nothing — it hands the CLI a session id and trusts the
// session to hold the context. So the rules exist to make sure that context
// is still the right one: same Agent, same harness and skills, newest run
// (so one conversation cannot fork into two branches), and a session the CLI
// can actually find again.
data class ResumeFacts(
    // The run asked to be resumed.
    val runId: UUID,
    val runStatus: String,
    val runAgentId: UUID,
    val runRuntime: String,
    val runInstanceHash: String?,
    val runSessionId: String?,
    val runSessionStore: String?,
    // The task's newest run, or null if it has none.
    val latestRunId: UUID?,
    val taskRunning: Boolean,
    // The task's Agent now, and what it would be built from now.
    val taskAgentId: UUID?,
    val taskAgentRuntime: String?,
    val currentInstanceHash: String?,
    // Whether the run's runtime can resume at all, and where it keeps its
    // sessions now (null when it cannot resume).
    val runtimeSupportsResume: Boolean,
    val currentSessionStore: String?,
)

object ResumeEligibility {

    private val FINISHED = setOf("succeeded", "failed")

    // null when the run can be resumed; otherwise why not, worded for the
    // operator. The first rule that fails wins, ordered from the most basic.
    fun refusal(f: ResumeFacts): String? = when {
        f.taskRunning ->
            "task is already running"
        f.latestRunId != f.runId ->
            "only the latest run of a task can be resumed, so one conversation can't fork into two"
        f.runStatus !in FINISHED ->
            "only a finished run can be resumed (this one is ${f.runStatus.replace('_', ' ')})"
        !f.runtimeSupportsResume ->
            "${f.runRuntime} runs can't be resumed yet — start a fresh run instead"
        f.taskAgentId != f.runAgentId ->
            "the task is assigned to a different Agent than the one that ran this — start a fresh run instead"
        f.taskAgentRuntime != f.runRuntime ->
            "the Agent now runs on ${f.taskAgentRuntime}, not ${f.runRuntime} — start a fresh run instead"
        f.runSessionId == null ->
            "this run recorded no session to resume — start a fresh run instead"
        f.runInstanceHash == null || f.runInstanceHash != f.currentInstanceHash ->
            "the Agent's harness or skills have changed since this run — start a fresh run instead"
        f.runSessionStore != null && f.runSessionStore != f.currentSessionStore ->
            "this run's session was saved under ${f.runSessionStore}, but the server now uses " +
                "${f.currentSessionStore} — it can't be found from here"
        else -> null
    }
}
