package com.kompanion.server.domain.model

import java.time.OffsetDateTime
import java.util.UUID

// A run in flight right now, with just enough to say what it is and where to
// look: the Runs tab lists these and links each one to its task page, which
// holds the live transcript. Deliberately thinner than a full task run — no
// tokens, no cost, nothing that is only known once the run ends.
//
// `agentTitle` is null when the Agent has since been deleted from the
// library; `runtime` is free text, same as RuntimeSpend.
data class ActiveRun(
    val runId: UUID,
    val taskId: UUID,
    val taskTitle: String,
    val teamId: UUID,
    val teamName: String,
    val agentTitle: String?,
    val runtime: String,
    val model: String?,
    val startedAt: OffsetDateTime,
)
