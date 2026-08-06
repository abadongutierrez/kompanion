import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import { AssignRoleInput, CreateRoleInput, HarnessTemplate, UpdateRoleInput } from "@kompanion/shared";
import { sql } from "../db/client.js";

// The app-wide Role library: create, edit, and the shared CLAUDE.md
// template all operate on the Role itself here, regardless of which
// Team(s) currently have it assigned — Roles are fully independent, the
// same level as Project itself, with no project/team ownership at all.
export const globalRolesRouter = Router();

// Team-scoped: which Roles this Team currently has assigned
// (team_roles), plus assign/unassign. Roles are only ever *created* via
// the global library above — this router is assignment-only.
export const teamRolesRouter = Router({ mergeParams: true });

type TeamParams = { teamId: string };

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// A Role's slug is its only stable, machine-usable identifier (e.g. the
// Project Manager team-snapshot gate keys off slug === "project-manager").
// Unique app-wide — on collision, append -2, -3, ... rather than fail.
// excludeRoleId lets an update keep its own slug when it didn't change.
async function uniqueSlug(title: string, excludeRoleId?: string): Promise<string> {
  const base = slugify(title) || "role";
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = excludeRoleId
      ? await sql`select 1 from roles where slug = ${candidate} and id != ${excludeRoleId}`
      : await sql`select 1 from roles where slug = ${candidate}`;
    if (existing.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// No scaffolding happens here — the operator is expected to have already
// created the harness directory (with its own .claude/ config) at
// harnessPath. We only validate it's really there, same as Repositories.
function validateHarnessPath(harnessPath: string): string | null {
  if (!existsSync(harnessPath)) {
    return `no directory at "${harnessPath}" — create the harness there first (with a .claude/ config), then register it`;
  }
  if (!existsSync(join(harnessPath, ".claude"))) {
    return `"${harnessPath}" exists but has no .claude/ config — it isn't a valid harness directory`;
  }
  return null;
}

globalRolesRouter.get("/", async (_req, res) => {
  const roles = await sql`select * from roles order by created_at`;
  res.json(roles);
});

globalRolesRouter.post("/", async (req, res) => {
  try {
    const parsed = CreateRoleInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { title, harnessPath } = parsed.data;

    const harnessError = validateHarnessPath(harnessPath);
    if (harnessError) {
      return res.status(400).json({ error: harnessError });
    }

    const slug = await uniqueSlug(title);

    const [role] = await sql`
      insert into roles (title, slug, harness_path)
      values (${title}, ${slug}, ${harnessPath})
      returning *
    `;
    res.status(201).json(role);
  } catch (error) {
    console.error("Error creating role:", error);
    res
      .status(500)
      .json({
        error:
          error instanceof Error ? error.message : "Failed to create role",
      });
  }
});

globalRolesRouter.patch("/:roleId", async (req, res) => {
  try {
    const { roleId } = req.params;
    const parsed = UpdateRoleInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { title, slug, harnessPath } = parsed.data;

    if (harnessPath !== undefined) {
      const harnessError = validateHarnessPath(harnessPath);
      if (harnessError) {
        return res.status(400).json({ error: harnessError });
      }
    }

    if (slug !== undefined) {
      const collision = await sql`select 1 from roles where slug = ${slug} and id != ${roleId}`;
      if (collision.length > 0) {
        return res.status(409).json({ error: `slug "${slug}" is already used by another role` });
      }
    }

    const [role] = await sql`
      update roles
      set
        title = coalesce(${title ?? null}, title),
        slug = coalesce(${slug ?? null}, slug),
        harness_path = coalesce(${harnessPath ?? null}, harness_path)
      where id = ${roleId}
      returning *
    `;
    if (!role) {
      return res.status(404).json({ error: "role not found" });
    }
    res.json(role);
  } catch (error) {
    console.error("Error updating role:", error);
    res
      .status(500)
      .json({
        error:
          error instanceof Error ? error.message : "Failed to update role",
      });
  }
});

async function loadRole(roleId: string) {
  const [role] = await sql`select * from roles where id = ${roleId}`;
  return role as { harnessPath: string } | undefined;
}

globalRolesRouter.get("/:roleId/harness-template", async (req, res) => {
  const { roleId } = req.params;
  const role = await loadRole(roleId);
  if (!role) {
    return res.status(404).json({ error: "role not found" });
  }
  const claudeMdPath = join(role.harnessPath, "CLAUDE.md");
  const content = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, "utf8") : "";
  res.json({ content });
});

globalRolesRouter.patch("/:roleId/harness-template", async (req, res) => {
  const { roleId } = req.params;
  const parsed = HarnessTemplate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const role = await loadRole(roleId);
  if (!role) {
    return res.status(404).json({ error: "role not found" });
  }
  writeFileSync(join(role.harnessPath, "CLAUDE.md"), parsed.data.content, "utf8");
  res.json({ content: parsed.data.content });
});

teamRolesRouter.get("/", async (req, res) => {
  const { teamId } = req.params as TeamParams;
  const roles = await sql`
    select r.* from roles r
    join team_roles tr on tr.role_id = r.id
    where tr.team_id = ${teamId}
    order by r.created_at
  `;
  res.json(roles);
});

teamRolesRouter.post("/", async (req, res) => {
  try {
    const { teamId } = req.params as TeamParams;
    const parsed = AssignRoleInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const [team] = await sql`select * from teams where id = ${teamId}`;
    if (!team) {
      return res.status(404).json({ error: "team not found" });
    }

    const [role] = await sql`select * from roles where id = ${parsed.data.roleId}`;
    if (!role) {
      return res.status(404).json({ error: "role not found" });
    }

    await sql`
      insert into team_roles (team_id, role_id) values (${teamId}, ${role.id})
      on conflict do nothing
    `;

    res.status(201).json(role);
  } catch (error) {
    console.error("Error assigning role:", error);
    res
      .status(500)
      .json({
        error:
          error instanceof Error ? error.message : "Failed to assign role",
      });
  }
});

teamRolesRouter.delete("/:roleId", async (req, res) => {
  const { teamId, roleId } = req.params as TeamParams & { roleId: string };
  const deleted = await sql`
    delete from team_roles where team_id = ${teamId} and role_id = ${roleId} returning *
  `;
  if (deleted.length === 0) {
    return res.status(404).json({ error: "role is not assigned to this team" });
  }
  res.status(204).send();
});
