package com.sdlcpaperclip.server.repository

import com.sdlcpaperclip.server.entity.Project
import com.sdlcpaperclip.server.entity.Repository
import com.sdlcpaperclip.server.entity.Role
import com.sdlcpaperclip.server.entity.Team
import org.springframework.data.repository.ListCrudRepository
import java.util.UUID

interface ProjectRepository : ListCrudRepository<Project, UUID> {
    fun findAllByOrderByCreatedAt(): List<Project>
}

interface TeamRepository : ListCrudRepository<Team, UUID> {
    fun findByProjectIdOrderByCreatedAt(projectId: UUID): List<Team>
}

interface RoleRepository : ListCrudRepository<Role, UUID> {
    fun findByTeamIdOrderByCreatedAt(teamId: UUID): List<Role>
    fun findByTeamIdAndSlug(teamId: UUID, slug: String): Role?
    fun findByTeamIdAndSlugAndIdNot(teamId: UUID, slug: String, id: UUID): Role?
}

interface RepositoryRepository : ListCrudRepository<Repository, UUID> {
    fun findByProjectIdOrderByCreatedAt(projectId: UUID): List<Repository>
}
