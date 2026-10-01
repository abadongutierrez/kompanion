package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.application.port.inbound.AgentSkillView
import com.kompanion.server.application.port.inbound.AssignSkills
import com.kompanion.server.application.port.inbound.AssignSkillsCommand
import com.kompanion.server.application.port.inbound.GetSkill
import com.kompanion.server.application.port.inbound.ListAgentSkills
import com.kompanion.server.application.port.inbound.ListSkills
import com.kompanion.server.application.port.inbound.RegisterSkill
import com.kompanion.server.application.port.inbound.RegisterSkillCommand
import com.kompanion.server.application.port.inbound.ScanResult
import com.kompanion.server.application.port.inbound.ScanSkills
import com.kompanion.server.application.port.inbound.SkillDetail
import com.kompanion.server.application.port.inbound.SkillView
import com.kompanion.server.application.port.inbound.UnregisterSkill
import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.domain.model.Skill
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.util.UUID

// Routing, serialization and status mapping only, with hand-written stubs:
// what the rules say is the use case tests' business.
@WebMvcTest(SkillController::class, AgentSkillsController::class)
@Import(SkillControllerTest.Stubs::class, DomainExceptionHandler::class)
class SkillControllerTest(@Autowired val mockMvc: MockMvc) {

    companion object {
        val ASSIGNED: UUID = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        val FREE: UUID = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
        val AGENT: UUID = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc")

        fun skill(id: UUID, slug: String) =
            Skill(id = id, slug = slug, name = slug, description = "does $slug", skillPath = "skills/$slug")

        val handoff = SkillView(skill(FREE, "handoff"), null)
        val lost = SkillView(skill(ASSIGNED, "lost"), "no folder at \"skills/lost\"")
    }

    @TestConfiguration
    class Stubs {
        @Bean fun listSkills() = object : ListSkills {
            override fun handle() = listOf(handoff, lost)
        }

        @Bean fun getSkill() = object : GetSkill {
            override fun handle(skillId: UUID) =
                if (skillId == FREE) SkillDetail(handoff, "# the body")
                else throw DomainException.NotFound("skill not found")
        }

        @Bean fun registerSkill() = object : RegisterSkill {
            override fun handle(command: RegisterSkillCommand) =
                if (command.path == "skills/handoff") handoff
                else throw DomainException.Invalid("no folder at \"${command.path}\"")
        }

        @Bean fun scanSkills() = object : ScanSkills {
            override fun handle() = ScanResult(listOf(handoff), emptyList(), listOf(lost))
        }

        // A skill that is assigned is refused; any other is removed.
        @Bean fun unregisterSkill() = object : UnregisterSkill {
            override fun handle(skillId: UUID) {
                if (skillId == ASSIGNED) {
                    throw DomainException.Conflict("skill is still assigned to: Engineer — remove it from them first")
                }
            }
        }

        @Bean fun listAgentSkills() = object : ListAgentSkills {
            override fun handle(agentId: UUID) = listOf(AgentSkillView(handoff, shadowedByHarness = true))
        }

        @Bean fun assignSkills() = object : AssignSkills {
            override fun handle(command: AssignSkillsCommand) =
                if (command.agentId == AGENT) command.skillIds.map { AgentSkillView(handoff, false) }
                else throw DomainException.NotFound("agent not found")
        }
    }

    @Test
    fun `listing returns each skill with its broken flag and problem`() {
        mockMvc.perform(get("/api/skills"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].slug").value("handoff"))
            .andExpect(jsonPath("$[0].broken").value(false))
            .andExpect(jsonPath("$[1].broken").value(true))
            .andExpect(jsonPath("$[1].problem").value("no folder at \"skills/lost\""))
    }

    @Test
    fun `detail carries the body, and an unknown id is 404`() {
        mockMvc.perform(get("/api/skills/$FREE"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.body").value("# the body"))
        mockMvc.perform(get("/api/skills/${UUID.randomUUID()}")).andExpect(status().isNotFound)
    }

    @Test
    fun `registering answers 201, and an invalid folder is 400 with the reason`() {
        mockMvc.perform(post("/api/skills").contentType(MediaType.APPLICATION_JSON).content("""{"path":" skills/handoff "}"""))
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.slug").value("handoff"))
        mockMvc.perform(post("/api/skills").contentType(MediaType.APPLICATION_JSON).content("""{"path":"skills/nope"}"""))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `scan reports what it registered, refreshed and found broken`() {
        mockMvc.perform(post("/api/skills/scan"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.registered[0].slug").value("handoff"))
            .andExpect(jsonPath("$.refreshed").isEmpty)
            .andExpect(jsonPath("$.broken[0].slug").value("lost"))
    }

    @Test
    fun `unregistering an assigned skill is 409 with the reason, a free one is 204`() {
        mockMvc.perform(delete("/api/skills/$ASSIGNED"))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error").value("skill is still assigned to: Engineer — remove it from them first"))
        mockMvc.perform(delete("/api/skills/$FREE")).andExpect(status().isNoContent)
    }

    @Test
    fun `an agent's skills list the shadowed flag`() {
        mockMvc.perform(get("/api/agents/$AGENT/skills"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].skill.slug").value("handoff"))
            .andExpect(jsonPath("$[0].shadowedByHarness").value(true))
    }

    @Test
    fun `putting the skill ids replaces the set, and an unknown agent is 404`() {
        mockMvc.perform(
            put("/api/agents/$AGENT/skills").contentType(MediaType.APPLICATION_JSON).content("""{"skillIds":["$FREE"]}"""),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].skill.slug").value("handoff"))
        mockMvc.perform(
            put("/api/agents/${UUID.randomUUID()}/skills").contentType(MediaType.APPLICATION_JSON).content("""{"skillIds":[]}"""),
        ).andExpect(status().isNotFound)
    }
}
