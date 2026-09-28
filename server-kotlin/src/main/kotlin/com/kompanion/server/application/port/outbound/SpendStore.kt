package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.DaySpend
import com.kompanion.server.domain.model.ProjectSpend
import java.util.UUID

// What the application needs of spend reporting. Implemented by
// adapter/outbound/persistence/JdbcSpendStore.
interface SpendStore {

    fun projectSpend(projectId: UUID): ProjectSpend

    // Current month only, newest day first — the window the Budget tab
    // breaks down, as opposed to the all-time totals above.
    fun projectDailySpend(projectId: UUID): List<DaySpend>
}
