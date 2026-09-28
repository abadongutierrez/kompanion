package com.kompanion.server.adapter.outbound.persistence

import com.kompanion.server.application.port.outbound.ProjectStore
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class JdbcProjectStore(private val jdbc: JdbcTemplate) : ProjectStore {

    override fun exists(id: UUID): Boolean =
        jdbc.queryForObject("select exists(select 1 from projects where id = ?)", Boolean::class.java, id) == true
}
