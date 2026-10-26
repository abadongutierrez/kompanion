package com.kompanion.server.adapter.outbound.claude

import com.kompanion.server.application.port.outbound.ClaudeUsageSource
import com.kompanion.server.application.port.outbound.UsageReading
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import java.io.File
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

// Reads usage the way Claude Code's own /usage screen does: the CLI's OAuth
// token against GET /api/oauth/usage. Undocumented — it can change or be
// closed at any time, so every failure becomes UsageReading.Unavailable and
// the sidebar hides the readout rather than erroring.
//
// The token is the CLI's, read from the credentials file of the user the
// server runs as — the same account ClaudeCodeRunner's child processes use,
// since they inherit this environment. It is read fresh each time (the CLI
// refreshes it on its own), sent only to api.anthropic.com, and never
// logged or returned.
@Component
class OAuthClaudeUsageSource(
    private val objectMapper: ObjectMapper,
) : ClaudeUsageSource {

    private val log = LoggerFactory.getLogger(javaClass)

    private val http: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()

    // Overridable for tests and for unusual setups; see credentialsFile().
    internal var credentialsFile: File = credentialsFile()
    internal var endpoint: URI = URI.create(System.getenv("CLAUDE_USAGE_URL") ?: DEFAULT_URL)

    override fun read(): UsageReading {
        val token = readToken() ?: return UsageReading.Unavailable(
            if (credentialsFile.exists()) "No Claude subscription login in ${credentialsFile.path}"
            else "No Claude credentials at ${credentialsFile.path} (API-key setups have no usage window)",
        )

        return try {
            val response = http.send(
                HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer $token")
                    .header("anthropic-beta", "oauth-2025-04-20")
                    .header("Accept", "application/json")
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString(),
            )
            if (response.statusCode() != 200) {
                return UsageReading.Unavailable("Usage endpoint answered ${response.statusCode()}")
            }
            @Suppress("UNCHECKED_CAST")
            val body = objectMapper.readValue(response.body(), Map::class.java) as Map<String, Any?>
            val windows = parseUsageResponse(body)
            if (windows.isEmpty()) UsageReading.Unavailable("Usage endpoint returned no windows")
            else UsageReading.Windows(windows)
        } catch (e: Exception) {
            // Message only: an exception from the HTTP client never carries
            // the header, but a stack trace is noise for a polled readout.
            log.warn("Claude usage read failed: {}", e.toString())
            UsageReading.Unavailable("Usage endpoint unreachable")
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun readToken(): String? {
        if (!credentialsFile.isFile) return null
        return try {
            val creds = objectMapper.readValue(credentialsFile, Map::class.java) as Map<String, Any?>
            ((creds["claudeAiOauth"] as? Map<String, Any?>)?.get("accessToken") as? String)
                ?.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        const val DEFAULT_URL = "https://api.anthropic.com/api/oauth/usage"

        // CLAUDE_CREDENTIALS_PATH wins; otherwise the same config dir the CLI
        // itself uses — CLAUDE_CONFIG_DIR if set, else ~/.claude. On macOS
        // the token is in the Keychain, the file is missing, and the readout
        // reports unavailable.
        fun credentialsFile(env: Map<String, String> = System.getenv()): File {
            env["CLAUDE_CREDENTIALS_PATH"]?.takeIf { it.isNotBlank() }?.let { return File(it) }
            val configDir = env["CLAUDE_CONFIG_DIR"]?.takeIf { it.isNotBlank() }
                ?: File(System.getProperty("user.home"), ".claude").path
            return File(configDir, ".credentials.json")
        }
    }
}
