package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.RunInstances
import com.kompanion.server.domain.model.AgentInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Component
class JdbcRunInstances(private val jdbc: JdbcTemplate) : RunInstances {

    @Transactional
    override fun record(runId: UUID, instance: AgentInstance) {
        jdbc.update(
            "update task_runs set instance_hash = ?, git_sha = ?, git_dirty = ? where id = ?",
            instance.hash, instance.gitSha, instance.gitDirty, runId,
        )
        // Replaced rather than appended, so recording twice leaves one answer.
        jdbc.update("delete from task_run_skills where run_id = ?", runId)
        for (skill in instance.skills) {
            jdbc.update(
                "insert into task_run_skills (run_id, skill_slug, skill_hash, outcome) values (?, ?, ?, ?)",
                runId, skill.slug, skill.hash, skill.outcome.name,
            )
        }
    }
}
