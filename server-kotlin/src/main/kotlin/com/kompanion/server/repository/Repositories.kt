package com.kompanion.server.repository

import com.kompanion.server.entity.Project
import com.kompanion.server.entity.Repository
import com.kompanion.server.entity.Agent
import com.kompanion.server.entity.Team
import org.springframework.data.jdbc.repository.query.Query
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

    // Any task of the project holding a run claim, including one left by a
    // crashed run. Their worktrees live under these repositories' paths.
    @Query(
        """
        select exists (
          select 1 from tasks t join teams tm on tm.id = t.team_id
          where tm.project_id = :projectId and t.running_since is not null
        )
        """,
    )
    fun projectHasRunningTask(projectId: UUID): Boolean

    // Held while a repository's path is checked and changed. A run's claim
    // takes the same row FOR SHARE (RunTaskService), so the two exclude each
    // other while claims do not wait on one another. Needs a transaction.
    @Query("select id from projects where id = :projectId for update")
    fun lockProject(projectId: UUID): UUID?
}
