package com.kompanion.server.adapter.inbound.web

import com.kompanion.server.domain.error.DomainException
import com.kompanion.server.dto.ErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

// Domain errors become status codes in exactly one place, so a use case
// never names HTTP and a migrated controller has no catch blocks. The body
// shape is the same ErrorResponse the legacy controllers return, because it
// is a published contract the UI already parses.
//
// Applies to every controller, migrated or not — the legacy ones simply
// never throw these.
@RestControllerAdvice
class DomainExceptionHandler {

    @ExceptionHandler(DomainException::class)
    fun handle(e: DomainException): ResponseEntity<ErrorResponse> {
        val status = when (e) {
            is DomainException.NotFound -> HttpStatus.NOT_FOUND
            is DomainException.Conflict -> HttpStatus.CONFLICT
            is DomainException.Invalid -> HttpStatus.BAD_REQUEST
        }
        return ResponseEntity.status(status).body(ErrorResponse(e.message ?: "request refused"))
    }
}
