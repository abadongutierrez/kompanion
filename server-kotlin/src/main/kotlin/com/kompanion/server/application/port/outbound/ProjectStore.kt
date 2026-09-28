package com.kompanion.server.application.port.outbound

import java.util.UUID

// Only what the spend slice needs so far. It grows when the projects
// endpoints migrate; a port is the need, not the table.
interface ProjectStore {

    fun exists(id: UUID): Boolean
}
