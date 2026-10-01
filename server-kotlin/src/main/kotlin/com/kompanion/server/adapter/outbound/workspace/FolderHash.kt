package com.kompanion.server.adapter.outbound.workspace

import java.io.File
import java.nio.file.Files
import java.security.MessageDigest

// One SHA-256 over a folder's content, used for skills and for whole agent
// instances. It covers each regular file's relative path and bytes, in sorted
// order. Timestamps, permissions and the order the filesystem happens to list
// things in do not matter, so identical content always gives the same hash.
// Empty folders are not content and are ignored.
object FolderHash {

    fun of(dir: File, exclude: (relativePath: String) -> Boolean = { false }): String {
        val digest = MessageDigest.getInstance("SHA-256")
        for ((relative, file) in files(dir, exclude)) {
            val name = relative.toByteArray(Charsets.UTF_8)
            // Length-prefixed, so "ab" + "c" and "a" + "bc" cannot collide.
            digest.update(name.size.toString().toByteArray())
            digest.update(0)
            digest.update(name)
            digest.update(file.length().toString().toByteArray())
            digest.update(0)
            file.inputStream().use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    digest.update(buffer, 0, read)
                }
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    // The files a hash covers, sorted by relative path with "/" separators.
    fun files(dir: File, exclude: (relativePath: String) -> Boolean = { false }): List<Pair<String, File>> {
        if (!dir.isDirectory) return emptyList()
        val root = dir.toPath()
        return Files.walk(root).use { stream ->
            stream
                .filter { Files.isRegularFile(it) }
                .map { root.relativize(it).joinToString("/") to it.toFile() }
                .filter { !exclude(it.first) }
                .sorted(compareBy { it.first })
                .toList()
        }
    }
}
