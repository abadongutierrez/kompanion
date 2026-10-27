package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.Runtime
import java.util.UUID

interface RuntimeStore {

    fun findById(id: UUID): Runtime?

    // Case-insensitive, matching the unique index.
    fun findByName(name: String): Runtime?

    // Ordered by name, so a list is stable.
    fun findAll(): List<Runtime>

    fun save(runtime: Runtime): Runtime

    fun delete(id: UUID)

    // Titles of the Agents running on this runtime, for the message that says
    // why it cannot be deleted.
    fun agentTitlesUsing(runtimeId: UUID): List<String>
}
