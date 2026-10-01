package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.SkillStore
import com.kompanion.server.domain.model.Skill
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
class JdbcSkillStore(
    private val rows: SkillRowRepository,
    private val jdbc: JdbcTemplate,
) : SkillStore {

    override fun findById(id: UUID): Skill? = rows.findById(id).orElse(null)?.toDomain()

    override fun findBySlug(slug: String): Skill? = rows.findBySlug(slug)?.toDomain()

    override fun findAll(): List<Skill> = rows.findAllByOrderBySlug().map { it.toDomain() }

    override fun findAllById(ids: Collection<UUID>): List<Skill> =
        if (ids.isEmpty()) emptyList() else rows.findAllById(ids).map { it.toDomain() }

    // createdAt is @ReadOnlyProperty (the column defaults to now()), so save()
    // does not read it back — re-fetch, as JdbcAgentStore does.
    override fun save(skill: Skill): Skill {
        val saved = rows.save(skill.toRow())
        return rows.findById(saved.id!!).orElse(saved).toDomain()
    }

    override fun delete(id: UUID) = rows.deleteById(id)

    override fun agentTitlesUsing(skillId: UUID): List<String> = jdbc.query(
        """
        select a.title from agent_skills s
        join agents a on a.id = s.agent_id
        where s.skill_id = ?
        order by a.title
        """.trimIndent(),
        { rs, _ -> rs.getString("title") },
        skillId,
    )

    override fun skillsFor(agentId: UUID): List<Skill> = jdbc.query(
        """
        select s.* from skills s
        join agent_skills a on a.skill_id = s.id
        where a.agent_id = ?
        order by s.slug
        """.trimIndent(),
        { rs, _ ->
            Skill(
                id = rs.getObject("id", UUID::class.java),
                slug = rs.getString("slug"),
                name = rs.getString("name"),
                description = rs.getString("description"),
                skillPath = rs.getString("skill_path"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            )
        },
        agentId,
    )

    override fun replaceAssignments(agentId: UUID, skillIds: Collection<UUID>) {
        jdbc.update("delete from agent_skills where agent_id = ?", agentId)
        for (skillId in skillIds) {
            jdbc.update("insert into agent_skills (agent_id, skill_id) values (?, ?)", agentId, skillId)
        }
    }
}
