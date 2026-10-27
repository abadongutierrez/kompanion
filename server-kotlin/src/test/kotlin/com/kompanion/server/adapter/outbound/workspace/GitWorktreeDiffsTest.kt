package com.kompanion.server.adapter.outbound.workspace

import com.kompanion.server.domain.model.Task
import com.kompanion.server.domain.model.TaskType
import com.kompanion.server.entity.Repository
import com.kompanion.server.repository.RepositoryRepository
import com.kompanion.server.service.RepoWorkspaceService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.mock
import java.io.File
import java.util.UUID

// Real git in a temp repo: the point is that the diff covers committed and
// uncommitted work, and ignores what landed on the base branch afterwards.
class GitWorktreeDiffsTest {

    @TempDir
    lateinit var tmp: File

    private val workspace = RepoWorkspaceService()
    private val diffs = GitWorktreeDiffs(mock(RepositoryRepository::class.java), workspace)

    private fun run(dir: File, vararg cmd: String) {
        val p = ProcessBuilder(*cmd).directory(dir).redirectErrorStream(true).start()
        val out = p.inputStream.bufferedReader().readText()
        check(p.waitFor() == 0) { "${cmd.joinToString(" ")} failed: $out" }
    }

    private fun git(dir: File, vararg args: String) =
        run(dir, "git", "-c", "user.name=t", "-c", "user.email=t@t", *args)

    private val task = Task(id = UUID.randomUUID(), teamId = UUID.randomUUID(), title = "Show diff", type = TaskType.story)

    private fun repo() = Repository(
        id = UUID.randomUUID(),
        projectId = UUID.randomUUID(),
        name = "app",
        localPath = tmp.path,
        defaultBranch = "main",
    )

    private fun initRepo() {
        git(tmp, "init", "-q", "-b", "main")
        File(tmp, "a.txt").writeText("one\n")
        git(tmp, "add", ".")
        git(tmp, "commit", "-q", "-m", "init")
    }

    @Test
    fun `no worktree yet is reported, not created`() {
        initRepo()
        val result = diffs.diff(task, repo())

        assertFalse(result.worktreeExists)
        assertEquals("", result.diff)
        assertFalse(workspace.resolveRepoWorktreeDir(tmp.path, task.id!!, task.title).exists())
    }

    @Test
    fun `diff has committed and uncommitted changes, not later base commits`() {
        initRepo()
        val wt = workspace.resolveRepoWorktreeDir(tmp.path, task.id!!, task.title)
        git(tmp, "worktree", "add", "-q", wt.path, "-b", workspace.taskBranchName(task.id!!, task.title, task.type), "main")

        File(wt, "a.txt").writeText("one\ntwo\n")
        git(wt, "commit", "-q", "-am", "work")
        File(wt, "a.txt").appendText("three\n")
        File(wt, "new.txt").writeText("x\n")

        // Lands on main after the worktree was cut: not this task's change.
        File(tmp, "b.txt").writeText("later\n")
        git(tmp, "add", "b.txt")
        git(tmp, "commit", "-q", "-m", "later")

        val result = diffs.diff(task, repo())

        assertTrue(result.worktreeExists)
        assertTrue(result.diff.contains("+two"))
        assertTrue(result.diff.contains("+three"))
        assertFalse(result.diff.contains("b.txt"))
        assertEquals(listOf("new.txt"), result.untrackedFiles)
        assertTrue(result.shortStat!!.contains("1 file changed"))
    }
}
