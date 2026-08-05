package com.kompanion.server.service

import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode
import org.springframework.stereotype.Service
import java.io.File

data class ManifestRepoEntry(
    val name: String?,
    val repositoryLocalPath: String?,
    val workspaceLocalPath: String,
)

// The single source of truth for "where am I, what branch, what repo" for a
// Task's run — written once by our own server code (which already knows
// these values with certainty at workspace-prep time), not computed or
// discovered by the model. Readable by any skill via a plain `cat
// manifest.json`, and by the PreToolUse enforcement hook
// (enforce-workspace.py), which derives its allowed-roots check from this
// same file instead of a separate one.
data class WorkspaceManifest(
    val branchName: String?,
    val primary: ManifestRepoEntry,
    val otherRepos: List<ManifestRepoEntry>,
)

private const val ENFORCEMENT_MATCHER = "Bash|Edit|Write|MultiEdit|Read"
private const val ENFORCEMENT_COMMAND =
    "python3 \${CLAUDE_PROJECT_DIR}/.claude/hooks/enforce-workspace.py"

@Service
class WorkspaceEnforcementService(
    private val objectMapper: ObjectMapper,
    private val claudeHarnessService: ClaudeHarnessService,
) {

    // hooks/ lives under the same shared workspace/ root as harnesses/ and
    // tasks/ — reuses ClaudeHarnessService's WORKSPACE_ROOT resolution
    // rather than recomputing it separately.
    private val hooksSrcDir = File(claudeHarnessService.workspaceRoot, "hooks")

    // enforce-workspace.py denies every raw Bash call except one shape:
    // invoking exec_in_folder.py, which does its own folder-membership
    // check and logs to commands.log — both scripts (plus the helper
    // module they share) have to travel together into the workspace.
    private val hookFiles = listOf("enforce-workspace.py", "exec_in_folder.py", "_workspace_common.py")

    // manifest.json (and, via the TASK_WORKSPACE_DIR env var each harness's
    // Stop hook writes activity.log to) live in the Task's own workspace
    // folder, not inside the real repository being worked on — they're our
    // app's metadata about the run, not part of the deliverable, and
    // shouldn't show up in that repo at all (not even as a gitignored file
    // sitting in the tree). cwdDir (where .claude/ + settings.json live,
    // since hooks only resolve from the exact cwd) is a separate directory:
    // the scratch workspace, or now a real repo's worktree.
    fun installCwdEnforcement(cwdDir: File, taskWorkspaceDir: File, manifest: WorkspaceManifest) {
        taskWorkspaceDir.mkdirs()
        File(taskWorkspaceDir, "manifest.json").writeText(
            objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(manifest),
        )

        val hooksDir = File(File(cwdDir, ".claude"), "hooks")
        hooksDir.mkdirs()
        for (file in hookFiles) {
            File(hooksSrcDir, file).copyTo(File(hooksDir, file), overwrite = true)
        }

        val settingsFile = File(File(cwdDir, ".claude"), "settings.json")
        val settings: ObjectNode = if (settingsFile.exists()) {
            try {
                objectMapper.readTree(settingsFile) as? ObjectNode ?: objectMapper.createObjectNode()
            } catch (e: Exception) {
                objectMapper.createObjectNode()
            }
        } else {
            objectMapper.createObjectNode()
        }

        val hooks = settings.withObject("hooks")
        val preToolUse = hooks.withArray("PreToolUse")
        val entry = objectMapper.createObjectNode()
        entry.put("matcher", ENFORCEMENT_MATCHER)
        val hookList = entry.putArray("hooks")
        val hookEntry = objectMapper.createObjectNode()
        hookEntry.put("type", "command")
        hookEntry.put("command", ENFORCEMENT_COMMAND)
        hookList.add(hookEntry)
        preToolUse.add(entry)

        settingsFile.writeText(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(settings))
    }
}
