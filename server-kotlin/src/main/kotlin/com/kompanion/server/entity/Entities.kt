package com.kompanion.server.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.relational.core.mapping.Table
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

// Property names are camelCase; Spring Data JDBC's default naming strategy
// converts them to snake_case column names automatically (projectId ->
// project_id), matching this schema's convention with no explicit @Column
// needed. IDs are DB-generated (gen_random_uuid()) — a null id means "new"
// to Spring Data JDBC (triggers INSERT, not overwrite), and the generated
// UUID is read back after insert.
//
// createdAt is @ReadOnlyProperty: every table defines it `default now()`,
// but Spring Data JDBC otherwise includes every constructor property in its
// generated INSERT — without this it sends an explicit NULL for createdAt
// and violates the not-null constraint instead of letting Postgres's own
// default fill it in. @ReadOnlyProperty excludes it from INSERT/UPDATE
// entirely; it's still populated when reading rows back.
//
// numeric columns (monthlyBudgetUsd) map to BigDecimal via the Postgres JDBC
// driver's natural default — unlike postgres.js, which needed a custom type
// parser to avoid numeric-as-string; Jackson serializes BigDecimal as a bare
// JSON number either way, so the wire shape the UI expects is unaffected.

@Table("projects")
data class Project(
    @Id val id: UUID? = null,
    val name: String,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)

@Table("teams")
data class Team(
    @Id val id: UUID? = null,
    val projectId: UUID,
    val name: String,
    val monthlyBudgetUsd: BigDecimal? = null,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)

// Fully app-wide — the same level as Project itself, no project/team
// ownership at all. Create once in the global agent library, then assign
// to whichever Teams want it (see team_agents, handled directly via
// JdbcTemplate in AgentController rather than a dedicated entity, same
// hybrid approach as task_repositories).
//
// harnessPath points at a directory whose .claude/agents/*.md are Claude
// Code *subagents* spawned inside this Agent's run — a different level,
// despite the shared word.
// Lowercase constants deliberately, matching TaskStatus/TaskType: Spring Data
// JDBC persists Kotlin enums via name()/valueOf(), so these must equal the
// stored text verbatim.
enum class AgentRuntime { claude_code, opencode }

@Table("agents")
data class Agent(
    @Id val id: UUID? = null,
    val title: String,
    val slug: String,
    val harnessPath: String,
    // Which CLI runs this Agent, and optionally which model. A null model
    // means "whatever that CLI defaults to" — the behaviour every Agent had
    // before these columns existed.
    val runtime: AgentRuntime = AgentRuntime.claude_code,
    val model: String? = null,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)

@Table("repositories")
data class Repository(
    @Id val id: UUID? = null,
    val projectId: UUID,
    val name: String,
    val localPath: String,
    val defaultBranch: String,
    val gitUrl: String? = null,
    @ReadOnlyProperty val createdAt: OffsetDateTime? = null,
)
