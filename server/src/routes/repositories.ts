import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import { CreateRepositoryInput, UpdateRepositoryInput } from "@sdlc/shared";
import { sql } from "../db/client.js";

export const repositoriesRouter = Router({ mergeParams: true });

type ProjectParams = { projectId: string };

// No cloning happens here — the operator is expected to have already
// cloned the repo to localPath. We only validate it's really there.
// Also requires at least one commit: `git worktree add -b <branch> <base>`
// fails on a repo with zero commits ("invalid reference"), and that failure
// otherwise only surfaces much later, at run time, as an opaque 500 — much
// easier to catch and explain right when the repo is registered.
function validateLocalPath(localPath: string): string | null {
  if (!existsSync(localPath)) {
    return `no directory at "${localPath}" — clone the repo there first, then register it`;
  }
  if (!existsSync(join(localPath, ".git"))) {
    return `"${localPath}" exists but isn't a git repository (no .git found)`;
  }
  try {
    execFileSync("git", ["-C", localPath, "rev-parse", "HEAD"], { stdio: "pipe" });
  } catch {
    return `"${localPath}" has no commits yet — make an initial commit before registering it (worktrees need a real branch to base off of)`;
  }
  return null;
}

repositoriesRouter.get("/", async (req, res) => {
  const { projectId } = req.params as ProjectParams;
  const repos = await sql`
    select * from repositories where project_id = ${projectId} order by created_at
  `;
  res.json(repos);
});

repositoriesRouter.post("/", async (req, res) => {
  const { projectId } = req.params as ProjectParams;
  const parsed = CreateRepositoryInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, localPath, defaultBranch, gitUrl } = parsed.data;

  const pathError = validateLocalPath(localPath);
  if (pathError) {
    return res.status(400).json({ error: pathError });
  }

  const [repo] = await sql`
    insert into repositories (project_id, name, local_path, default_branch, git_url)
    values (${projectId}, ${name}, ${localPath}, ${defaultBranch ?? "main"}, ${gitUrl ?? null})
    returning *
  `;
  res.status(201).json(repo);
});

repositoriesRouter.patch("/:repositoryId", async (req, res) => {
  const { repositoryId } = req.params;
  const parsed = UpdateRepositoryInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, localPath, defaultBranch, gitUrl } = parsed.data;

  if (localPath !== undefined) {
    const pathError = validateLocalPath(localPath);
    if (pathError) {
      return res.status(400).json({ error: pathError });
    }
  }

  const [repo] = await sql`
    update repositories
    set
      name = coalesce(${name ?? null}, name),
      local_path = coalesce(${localPath ?? null}, local_path),
      default_branch = coalesce(${defaultBranch ?? null}, default_branch),
      git_url = ${gitUrl === undefined ? sql`git_url` : gitUrl}
    where id = ${repositoryId}
    returning *
  `;
  if (!repo) {
    return res.status(404).json({ error: "repository not found" });
  }
  res.json(repo);
});
