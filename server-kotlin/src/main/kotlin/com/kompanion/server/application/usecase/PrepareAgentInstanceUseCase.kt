package com.kompanion.server.application.usecase

import com.kompanion.server.application.port.inbound.PrepareAgentInstance
import com.kompanion.server.application.port.inbound.PrepareAgentInstanceCommand
import com.kompanion.server.application.port.inbound.PreparedInstance
import com.kompanion.server.application.port.outbound.AgentInstances
import com.kompanion.server.application.port.outbound.BuildInstanceRequest
import com.kompanion.server.application.port.outbound.RunInstances
import com.kompanion.server.application.port.outbound.SkillStore
import org.springframework.stereotype.Service

@Service
class PrepareAgentInstanceUseCase(
    private val skills: SkillStore,
    private val instances: AgentInstances,
    private val runs: RunInstances,
) : PrepareAgentInstance {

    override fun handle(command: PrepareAgentInstanceCommand): PreparedInstance {
        val built = instances.build(
            BuildInstanceRequest(
                runtime = command.runtime,
                harnessPath = command.harnessPath,
                skills = skills.skillsFor(command.agentId),
            ),
        )
        // Recorded before the CLI starts, so a run that fails halfway still
        // says what it was built from.
        runs.record(command.runId, built.instance)
        return PreparedInstance(built.instance, built.path)
    }
}
