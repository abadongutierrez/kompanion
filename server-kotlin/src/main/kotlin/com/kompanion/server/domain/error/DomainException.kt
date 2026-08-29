package com.kompanion.server.domain.error

// What a use case throws when a rule says no. The web adapter turns these
// into status codes in one place (adapter/inbound/web/DomainExceptionHandler),
// so a use case never names an HTTP concept.
//
// Three cases, not one per rule: the mapping is what varies, and there are
// only three mappings. A rule that eventually needs its own status code gets
// its own subtype then, not before.
sealed class DomainException(message: String) : RuntimeException(message) {

    // The thing being acted on does not exist. -> 404
    class NotFound(message: String) : DomainException(message)

    // It exists, but its current state forbids this. -> 409
    class Conflict(message: String) : DomainException(message)

    // The request is well-formed but asks for something the rules reject.
    // -> 400
    class Invalid(message: String) : DomainException(message)
}
