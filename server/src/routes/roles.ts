import { existsSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import { Role } from "@sdlc/shared";
import { sql } from "../db/client.js";

export const rolesRouter = Router({ mergeParams: true });

const CreateRoleBody = Role.pick({ title: true, harnessPath: true });
const UpdateRoleBody = Role.pick({ title: true, harnessPath: true }).partial();

type TeamParams = { teamId: string };

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// A Role's slug is its only stable, machine-usable identifier (e.g. the
// Project Manager team-snapshot gate keys off slug === "project-manager").
// Unique per team — on collision, append -2, -3, ... rather than fail.
// excludeRoleId lets an update keep its own slug when the title didn't
// meaningfully change (or just re-derive cleanly if it did).
async function uniqueSlugForTeam(
  teamId: string,
  title: string,
  excludeRoleId?: string,
): Promise<string> {
  const base = slugify(title) || "role";
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = excludeRoleId
      ? await sql`
          select 1 from roles
          where team_id = ${teamId} and slug = ${candidate} and id != ${excludeRoleId}
        `
      : await sql`
          select 1 from roles where team_id = ${teamId} and slug = ${candidate}
        `;
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

rolesRouter.get("/", async (req, res) => {
  const { teamId } = req.params as TeamParams;
  const roles = await sql`
    select * from roles where team_id = ${teamId} order by created_at
  `;
  res.json(roles);
});

rolesRouter.post("/", async (req, res) => {
  const { teamId } = req.params as TeamParams;
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { title, harnessPath } = parsed.data;

  const harnessError = validateHarnessPath(harnessPath);
  if (harnessError) {
    return res.status(400).json({ error: harnessError });
  }

  const slug = await uniqueSlugForTeam(teamId, title);

  const [role] = await sql`
    insert into roles (team_id, title, slug, harness_path)
    values (${teamId}, ${title}, ${slug}, ${harnessPath})
    returning *
  `;
  res.status(201).json(role);
});

rolesRouter.patch("/:roleId", async (req, res) => {
  const { teamId, roleId } = req.params as TeamParams & { roleId: string };
  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { title, harnessPath } = parsed.data;

  if (harnessPath !== undefined) {
    const harnessError = validateHarnessPath(harnessPath);
    if (harnessError) {
      return res.status(400).json({ error: harnessError });
    }
  }

  const slug =
    title !== undefined ? await uniqueSlugForTeam(teamId, title, roleId) : undefined;

  const [role] = await sql`
    update roles
    set
      title = coalesce(${title ?? null}, title),
      slug = coalesce(${slug ?? null}, slug),
      harness_path = coalesce(${harnessPath ?? null}, harness_path)
    where id = ${roleId} and team_id = ${teamId}
    returning *
  `;
  if (!role) {
    return res.status(404).json({ error: "role not found" });
  }
  res.json(role);
});
