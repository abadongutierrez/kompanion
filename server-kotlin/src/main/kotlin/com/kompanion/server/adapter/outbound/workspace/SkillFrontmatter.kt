package com.kompanion.server.adapter.outbound.workspace

// Reads the `---` block at the top of a SKILL.md. Only what a skill needs:
// `key: value` lines, quoted values, and the folded (`>`) and literal (`|`)
// block forms that long descriptions use. Anything fancier is not a skill
// field and is ignored. A small hand parser keeps a YAML dependency out of the
// stack for two fields (specs/tech-stack.md: a new dependency needs a reason).
object SkillFrontmatter {

    // Null when there is no frontmatter block at all.
    fun parse(text: String): Map<String, String>? {
        val lines = text.removePrefix("﻿").lines()
        if (lines.firstOrNull()?.trim() != "---") return null

        val end = lines.drop(1).indexOfFirst { it.trim() == "---" }
        if (end < 0) return null
        val block = lines.subList(1, end + 1)

        val result = mutableMapOf<String, String>()
        var i = 0
        while (i < block.size) {
            val line = block[i]
            val colon = line.indexOf(':')
            // Indented lines belong to the key above; blank and comment lines
            // carry nothing.
            if (colon <= 0 || line.first().isWhitespace() || line.trimStart().startsWith("#")) {
                i++
                continue
            }
            val key = line.substring(0, colon).trim().lowercase()
            val rest = line.substring(colon + 1).trim()

            if (rest.isEmpty() || rest in BLOCK_MARKERS) {
                val literal = rest.startsWith("|")
                val body = mutableListOf<String>()
                var j = i + 1
                while (j < block.size && (block[j].isBlank() || block[j].first().isWhitespace())) {
                    body += block[j].trim()
                    j++
                }
                result[key] = body.filter { it.isNotEmpty() }.joinToString(if (literal) "\n" else " ")
                i = j
            } else {
                result[key] = unquote(rest)
                i++
            }
        }
        return result
    }

    private val BLOCK_MARKERS = setOf(">", ">-", ">+", "|", "|-", "|+")

    private fun unquote(value: String): String =
        if (value.length >= 2 &&
            ((value.first() == '"' && value.last() == '"') || (value.first() == '\'' && value.last() == '\''))
        ) {
            value.substring(1, value.length - 1)
        } else {
            value
        }
}
