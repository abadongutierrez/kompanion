package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.domain.model.Skill
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.ListCrudRepository
import java.time.OffsetDateTime
import java.util.UUID

// The skills table. agent_skills has no row type of its own: it is a plain
// link table, handled with JdbcTemplate in JdbcSkillStore.
@Table("skills")
data class SkillRow(
    @Id val id: UUID? = null,
    val slug: String,
    val name: String,
    val description: String,
    val skillPath: String,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)

interface SkillRowRepository : ListCrudRepository<SkillRow, UUID> {
    fun findBySlug(slug: String): SkillRow?
    fun findAllByOrderBySlug(): List<SkillRow>
}

fun SkillRow.toDomain(): Skill = Skill(
    id = id,
    slug = slug,
    name = name,
    description = description,
    skillPath = skillPath,
    createdAt = createdAt,
)

fun Skill.toRow(): SkillRow = SkillRow(
    id = id,
    slug = slug,
    name = name,
    description = description,
    skillPath = skillPath,
    createdAt = createdAt,
)
