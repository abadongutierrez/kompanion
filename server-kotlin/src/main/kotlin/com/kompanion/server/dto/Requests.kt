package com.kompanion.server.dto

// Separate from the entities on purpose, mirroring how packages/shared's Zod
// schemas already separate e.g. Role from CreateRoleInput/UpdateRoleInput
// (.pick()/.partial() of the full domain type). Update DTOs use nullable
// fields to distinguish "not provided" (leave unchanged) from an explicit
// value — the controller layer does the coalesce-style partial update, same
// as today's `coalesce(${x ?? null}, x)` SQL pattern.

data class CreateProjectRequest(val name: String)

data class CreateTeamRequest(val name: String)

data class CreateRoleRequest(val title: String, val harnessPath: String)

// slug is only touched when explicitly provided — unlike creation, editing
// never silently re-derives it from a title change.
data class UpdateRoleRequest(
    val title: String? = null,
    val slug: String? = null,
    val harnessPath: String? = null,
)

// POST /api/teams/{teamId}/roles — assign an existing Role (from the
// global role library) to this team. Roles are only ever created via
// /api/roles; within a team's context it's assignment-only. (Not to be
// confused with TaskRequests.kt's AssignRoleRequest, which assigns a Role
// to a Task.)
data class AssignRoleToTeamRequest(val roleId: java.util.UUID)

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
