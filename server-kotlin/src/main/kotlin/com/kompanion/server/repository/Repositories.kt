package com.kompanion.server.repository

import com.kompanion.server.entity.Project
import com.kompanion.server.entity.Repository
import com.kompanion.server.entity.Agent
import com.kompanion.server.entity.Team
import org.springframework.data.repository.ListCrudRepository
import java.util.UUID

interface ProjectRepository : ListCrudRepository<Project, UUID> {
    fun findAllByOrderByCreatedAt(): List<Project>
}

interface TeamRepository : ListCrudRepository<Team, UUID> {
    fun findByProjectIdOrderByCreatedAt(projectId: UUID): List<Team>
}

interface AgentRepository : ListCrudRepository<Agent, UUID> {
    fun findAllByOrderByCreatedAt(): List<Agent>
    fun findBySlug(slug: String): Agent?
    fun findBySlugAndIdNot(slug: String, id: UUID): Agent?
}

interface RepositoryRepository : ListCrudRepository<Repository, UUID> {
    fun findByProjectIdOrderByCreatedAt(projectId: UUID): List<Repository>
}
