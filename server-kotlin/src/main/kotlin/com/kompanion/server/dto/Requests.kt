package com.kompanion.server.dto

// Separate from the entities on purpose, mirroring how packages/shared's Zod
// schemas already separate e.g. Agent from CreateAgentInput/UpdateAgentInput
// (.pick()/.partial() of the full domain type). Update DTOs use nullable
// fields to distinguish "not provided" (leave unchanged) from an explicit
// value — the controller layer does the coalesce-style partial update, same
// as today's `coalesce(${x ?? null}, x)` SQL pattern.

data class CreateProjectRequest(val name: String)

data class CreateTeamRequest(val name: String)

data class CreateAgentRequest(
    val title: String,
    val harnessPath: String,
    val runtime: String? = null,
    val model: String? = null,
)

// slug is only touched when explicitly provided — unlike creation, editing
// never silently re-derives it from a title change.
data class UpdateAgentRequest(
    val title: String? = null,
    val slug: String? = null,
    val harnessPath: String? = null,
    val runtime: String? = null,
    // Blank clears the model back to the CLI default; null leaves it alone.
    val model: String? = null,
)

// POST /api/teams/{teamId}/agents — assign an existing Agent (from the
// global agent library) to this team. Agents are only ever created via
// /api/agents; within a team's context it's assignment-only. (Not to be
// confused with TaskRequests.kt's AssignAgentRequest, which assigns an Agent
// to a Task.)
data class AssignAgentToTeamRequest(val agentId: java.util.UUID)

data class HarnessTemplateRequest(val content: String)

data class CreateRepositoryRequest(
    val name: String,
    val localPath: String,
    val defaultBranch: String? = null,
    val gitUrl: String? = null,
)

data class UpdateRepositoryRequest(
    val name: String? = null,
    val localPath: String? = null,
    val defaultBranch: String? = null,
    val gitUrl: String? = null,
)

data class ErrorResponse(val error: String)
