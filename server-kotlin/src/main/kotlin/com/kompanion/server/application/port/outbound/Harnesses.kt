package com.kompanion.server.application.port.outbound

import com.kompanion.server.domain.model.AgentRuntime

// The harness folders an Agent runs out of. Named for the need: the
// application wants to know whether a path is a usable harness and what form
// of it to store — not that the answer comes from the filesystem and the
// runner beans (adapter/outbound/workspace/FileHarnesses).
interface Harnesses {

    // The form to persist: absolute paths inside the server's workspace root
    // are stored relative to it, so the database stays portable.
    fun normalizePath(path: String): String

    // null when the path is a usable harness for that runtime, otherwise an
    // operator-facing reason. Checked at create/edit time, so a bad pairing
    // is reported while it can still be fixed rather than at run time.
    fun validate(runtime: AgentRuntime, path: String): String?
}
