package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.AgentInstance
import com.kompanion.server.domain.model.AgentRuntime
import com.kompanion.server.domain.model.Skill

// Builds the agent instance for a run: the harness plus the Agent's skills,
// laid out the way its runtime loads them, hashed and stored once by hash.
// What comes back says where the stored copy is and what went into it.
interface AgentInstances {
    fun build(request: BuildInstanceRequest): BuiltInstance
}

data class BuildInstanceRequest(
    val runtime: AgentRuntime,
    // The Agent's harnessPath, in its stored form.
    val harnessPath: String,
    val skills: List<Skill>,
)

data class BuiltInstance(
    val instance: AgentInstance,
    // The stored instance folder. Read-only input: runs copy from it.
    val path: String,
)

// Which commit of the library a run was built from. Null when the library is
// not inside a git repo, or git is not there.
interface LibraryVersion {
    // paths are the harness and skill folders the instance used; dirty means
    // any of them has uncommitted changes.
    fun of(paths: List<String>): GitState?
}

data class GitState(val sha: String, val dirty: Boolean)

// Writes down what a run was built from on its task_runs row.
interface RunInstances {
    fun record(runId: java.util.UUID, instance: AgentInstance)
}
