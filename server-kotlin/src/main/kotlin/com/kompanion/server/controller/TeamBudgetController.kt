package com.kompanion.server.controller

import com.kompanion.server.dto.ErrorResponse
import com.kompanion.server.dto.UpdateTeamBudgetRequest
import com.kompanion.server.repository.TeamRepository
import com.kompanion.server.service.BudgetService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/teams/{teamId}")
class TeamBudgetController(
    private val teams: TeamRepository,
    private val budgetService: BudgetService,
) {

    @PatchMapping("/budget")
    fun updateBudget(
        @PathVariable teamId: UUID,
        @RequestBody body: UpdateTeamBudgetRequest,
    ): ResponseEntity<Any> {
        // Mirrors UpdateTeamBudgetInput's Zod `monthlyBudgetUsd: z.number().positive().nullable()`.
        if (body.monthlyBudgetUsd != null && body.monthlyBudgetUsd <= java.math.BigDecimal.ZERO) {
            return ResponseEntity.badRequest().body(ErrorResponse("monthlyBudgetUsd must be greater than 0"))
        }
        val existing = teams.findById(teamId).orElse(null)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse("team not found"))
        val saved = teams.save(existing.copy(monthlyBudgetUsd = body.monthlyBudgetUsd))
        return ResponseEntity.ok(saved)
    }

    @GetMapping("/spend")
    fun spend(@PathVariable teamId: UUID) = budgetService.getTeamSpend(teamId)

    // Separate from /spend rather than a field on it: the board polls /spend
    // on every card to decide whether runs are refused, and has no use for
    // the breakdown.
    @GetMapping("/spend/daily")
    fun dailySpend(@PathVariable teamId: UUID) = budgetService.getDailySpend(teamId)
}
