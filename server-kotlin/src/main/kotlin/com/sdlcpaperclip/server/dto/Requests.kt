package com.sdlcpaperclip.server.dto

// Separate from the entities on purpose, mirroring how packages/shared's Zod
// schemas already separate e.g. Role from CreateRoleInput/UpdateRoleInput
// (.pick()/.partial() of the full domain type). Update DTOs use nullable
// fields to distinguish "not provided" (leave unchanged) from an explicit
// value — the controller layer does the coalesce-style partial update, same
// as today's `coalesce(${x ?? null}, x)` SQL pattern.

data class CreateProjectRequest(val name: String)

data class CreateTeamRequest(val name: String)

data class CreateRoleRequest(val title: String, val harnessPath: String)

data class UpdateRoleRequest(val title: String? = null, val harnessPath: String? = null)

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
