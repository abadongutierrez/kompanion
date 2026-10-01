import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ensureProjectAndTeam, ensureAgents, deleteTask } from "./fixtures.js";

// The skills library, end to end. A skill is a folder on disk, so these tests
// make real folders under the repo's library/skills/ — which is where the
// server looks, as long as it runs with its default LIBRARY_ROOT — and take
// them away again afterwards. Skills and Agents have no delete endpoint in the
// UI, so the cleanup goes through the API: un-teach, then unregister.
//
// The Agent they teach is one that already exists (agents cannot be deleted,
// and this suite must not leave a new one behind each run). Its skills are put
// back to what they were.
const SKILLS_DIR = fileURLToPath(new URL("../../library/skills/", import.meta.url));

type SkillRow = { id: string; slug: string; broken: boolean; problem: string | null };
type AgentRow = { id: string; title: string };

test.describe("skills library", () => {
  const stamp = Date.now();
  let created: string[] = [];
  let agent: AgentRow;
  let agentOriginalSkillIds: string[];

  function slugFor(name: string) {
    const slug = `e2e-${name}-${stamp}`;
    created.push(slug);
    return slug;
  }

  function makeSkill(slug: string, description = "an end to end skill") {
    mkdirSync(`${SKILLS_DIR}${slug}`, { recursive: true });
    writeFileSync(
      `${SKILLS_DIR}${slug}/SKILL.md`,
      `---\nname: ${slug}\ndescription: ${description}\n---\n# ${slug}\n\nBody for ${slug}.\n`,
    );
  }

  async function skills(request: APIRequestContext): Promise<SkillRow[]> {
    return request.get("/api/skills").then((r) => r.json());
  }

  async function assign(request: APIRequestContext, skillIds: string[]) {
    const res = await request.put(`/api/agents/${agent.id}/skills`, { data: { skillIds } });
    expect(res.ok()).toBe(true);
  }

  test.beforeAll(async ({ request }) => {
    const { teamId } = await ensureProjectAndTeam(request);
    await ensureAgents(request, teamId);
    const agents: AgentRow[] = await request.get("/api/agents").then((r) => r.json());
    agent = agents[0];
    const before: { skill: { id: string } }[] = await request
      .get(`/api/agents/${agent.id}/skills`)
      .then((r) => r.json());
    agentOriginalSkillIds = before.map((a) => a.skill.id);
  });

  test.afterEach(async ({ request }) => {
    // Un-teach first (the database refuses to drop a skill that is still
    // assigned), then unregister whatever this test registered, then remove
    // the folders.
    const mine = (await skills(request)).filter((s) => created.includes(s.slug));
    const stillTaught = new Set(mine.map((s) => s.id));
    const current: { skill: { id: string } }[] = await request
      .get(`/api/agents/${agent.id}/skills`)
      .then((r) => r.json());
    await assign(
      request,
      current.map((a) => a.skill.id).filter((id) => !stillTaught.has(id)),
    );
    for (const skill of mine) await request.delete(`/api/skills/${skill.id}`);
    for (const slug of created) rmSync(`${SKILLS_DIR}${slug}`, { recursive: true, force: true });
    created = [];
  });

  test.afterAll(async ({ request }) => {
    // The Agent ends with the skills it started with, and nothing of ours is
    // left in the library.
    await assign(request, agentOriginalSkillIds);
    expect((await skills(request)).filter((s) => s.slug.startsWith(`e2e-`) && s.slug.endsWith(`-${stamp}`))).toEqual([]);
  });

  test("register a skill by path and see it listed with its description", async ({ page }) => {
    const slug = slugFor("register");
    makeSkill(slug, "registers through the page");

    await page.goto("/skills");
    await page.getByLabel("Skill folder path").fill(`${SKILLS_DIR}${slug}`);
    await page.getByRole("button", { name: "Register", exact: true }).click();

    const row = page.getByTestId(`skill-${slug}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("registers through the page");
    await expect(row).not.toContainText("broken");
  });

  test("registering a folder that is not a skill shows why", async ({ page }) => {
    const slug = slugFor("notskill");
    mkdirSync(`${SKILLS_DIR}${slug}`, { recursive: true });

    await page.goto("/skills");
    await page.getByLabel("Skill folder path").fill(`${SKILLS_DIR}${slug}`);
    await page.getByRole("button", { name: "Register", exact: true }).click();

    await expect(page.getByText("has no SKILL.md")).toBeVisible();
    await expect(page.getByTestId(`skill-${slug}`)).toHaveCount(0);
  });

  test("scan finds a skill folder that was added on disk and reports it", async ({ page }) => {
    const slug = slugFor("scan");
    makeSkill(slug);

    await page.goto("/skills");
    await page.getByRole("button", { name: "Scan library" }).click();

    await expect(page.getByRole("status")).toContainText("registered");
    await expect(page.getByTestId(`skill-${slug}`)).toBeVisible();
  });

  test("a skill whose folder disappears is shown as broken, and is not removed", async ({ page, request }) => {
    const slug = slugFor("broken");
    makeSkill(slug);
    await request.post("/api/skills", { data: { path: `${SKILLS_DIR}${slug}` } });

    rmSync(`${SKILLS_DIR}${slug}`, { recursive: true, force: true });
    await page.goto("/skills");

    const row = page.getByTestId(`skill-${slug}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("broken");
    await expect(row).toContainText("no folder");
  });

  test("view shows the text of the SKILL.md", async ({ page, request }) => {
    const slug = slugFor("view");
    makeSkill(slug);
    await request.post("/api/skills", { data: { path: `${SKILLS_DIR}${slug}` } });

    await page.goto("/skills");
    await page.getByTestId(`skill-${slug}`).getByRole("button", { name: "View" }).click();

    await expect(page.getByLabel(`SKILL.md of ${slug}`)).toContainText(`Body for ${slug}.`);
  });

  test("unregistering an assigned skill is refused with the reason, and works once it is un-taught", async ({
    page,
    request,
  }) => {
    const slug = slugFor("assigned");
    makeSkill(slug);
    const registered: SkillRow = await request
      .post("/api/skills", { data: { path: `${SKILLS_DIR}${slug}` } })
      .then((r) => r.json());
    await assign(request, [...agentOriginalSkillIds, registered.id]);

    await page.goto("/skills");
    const row = page.getByTestId(`skill-${slug}`);
    await row.getByRole("button", { name: "Unregister" }).click();
    await expect(row).toContainText("still assigned to");
    await expect(row).toContainText(agent.title);

    await assign(request, agentOriginalSkillIds);
    await row.getByRole("button", { name: "Unregister" }).click();
    await expect(page.getByTestId(`skill-${slug}`)).toHaveCount(0);
    // Only the row went. The folder is still there.
    expect((await skills(request)).find((s) => s.slug === slug)).toBeUndefined();
  });

  test("teach a skill in the Agent form: tick, save, reload, still ticked; untick and it is gone", async ({
    page,
    request,
  }) => {
    const slug = slugFor("teach");
    makeSkill(slug);
    await request.post("/api/skills", { data: { path: `${SKILLS_DIR}${slug}` } });

    await page.goto(`/agents/${agent.id}`);
    const box = page.getByRole("checkbox", { name: slug });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await box.check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/agents$/);

    await page.goto(`/agents/${agent.id}`);
    await expect(page.getByRole("checkbox", { name: slug })).toBeChecked();
    const taught: { skill: { slug: string } }[] = await request
      .get(`/api/agents/${agent.id}/skills`)
      .then((r) => r.json());
    expect(taught.map((a) => a.skill.slug)).toContain(slug);

    await page.getByRole("checkbox", { name: slug }).uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/agents$/);

    const after: { skill: { slug: string } }[] = await request
      .get(`/api/agents/${agent.id}/skills`)
      .then((r) => r.json());
    expect(after.map((a) => a.skill.slug)).not.toContain(slug);
  });

  test("a skill the agent's harness already has is flagged on the form", async ({ page, request }) => {
    // engineer's harness carries an implement-task skill; a library skill with
    // the same slug loses to it, and the form says so once it is assigned.
    const agents: { id: string; harnessPath: string }[] = await request.get("/api/agents").then((r) => r.json());
    const engineer = agents.find((a) => a.harnessPath.endsWith("harnesses/engineer"));
    test.skip(!engineer, "no engineer agent in this database");

    mkdirSync(`${SKILLS_DIR}implement-task`, { recursive: true });
    writeFileSync(
      `${SKILLS_DIR}implement-task/SKILL.md`,
      "---\nname: implement-task\ndescription: library version\n---\n",
    );
    try {
      const registered: SkillRow = await request
        .post("/api/skills", { data: { path: `${SKILLS_DIR}implement-task` } })
        .then((r) => r.json());
      const before: { skill: { id: string } }[] = await request
        .get(`/api/agents/${engineer!.id}/skills`)
        .then((r) => r.json());
      const keep = before.map((a) => a.skill.id);
      await request.put(`/api/agents/${engineer!.id}/skills`, { data: { skillIds: [...keep, registered.id] } });

      await page.goto(`/agents/${engineer!.id}`);
      await expect(page.getByText("The harness already has a skill with this name")).toBeVisible();

      await request.put(`/api/agents/${engineer!.id}/skills`, { data: { skillIds: keep } });
      await request.delete(`/api/skills/${registered.id}`);
    } finally {
      rmSync(`${SKILLS_DIR}implement-task`, { recursive: true, force: true });
    }
  });
});

test.describe("what a run was built from", () => {
  let projectId: string;
  let teamId: string;
  let taskId: string | undefined;

  test.beforeAll(async ({ request }) => {
    ({ projectId, teamId } = await ensureProjectAndTeam(request));
  });

  test.afterEach(async ({ request }) => {
    if (taskId) await deleteTask(request, teamId, taskId);
    taskId = undefined;
  });

  test("the run shows its agent instance, the library commit and each skill's outcome", async ({ page, request }) => {
    const task: { id: string } = await request
      .post(`/api/teams/${teamId}/tasks`, { data: { teamId, title: `E2E instance ${Date.now()}`, type: "story" } })
      .then((r) => r.json());
    taskId = task.id;

    // Real runs need an agent CLI and cost money, so the list is stubbed, the
    // way task-page.spec.ts does it.
    const base = {
      taskId, agentId: null, agentTitle: "Engineer", runtime: "claude_code", model: null,
      status: "succeeded", summary: null, rawOutput: null, costUsd: null, durationMs: 1000,
      inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null,
    };
    await page.route(`**/api/teams/${teamId}/tasks/${taskId}/runs`, (route) =>
      route.fulfill({
        json: [
          {
            ...base, id: "aaaaaaaa-1111-1111-1111-111111111111", createdAt: "2026-10-01T12:30:00.000Z",
            instanceHash: "abcdef0123456789", gitSha: "9fceb02ff00aa", gitDirty: true,
            skills: [
              { slug: "handoff", hash: "h1", outcome: "loaded" },
              { slug: "implement-task", hash: "h2", outcome: "skipped_harness_has_it" },
              { slug: "gone", hash: null, outcome: "missing" },
            ],
          },
          {
            ...base, id: "bbbbbbbb-2222-2222-2222-222222222222", createdAt: "2026-10-01T12:20:00.000Z",
            instanceHash: "0011223344556677", gitSha: null, gitDirty: null, skills: [],
          },
          {
            // A run from before agent instances existed: nothing to show.
            ...base, id: "cccccccc-3333-3333-3333-333333333333", createdAt: "2026-09-01T12:10:00.000Z",
            instanceHash: null, gitSha: null, gitDirty: null, skills: [],
          },
        ],
      }),
    );

    await page.goto(`/projects/${projectId}/tasks/${taskId}`);

    const panels = page.getByTestId("run-instance");
    await expect(panels).toHaveCount(2);

    const first = panels.nth(0);
    await expect(first).toContainText("abcdef01");
    await expect(first).toContainText("9fceb02");
    await expect(first).toContainText("uncommitted changes");
    await expect(first).toContainText("handoff");
    await expect(first).toContainText("implement-task");
    await expect(first).toContainText("gone");

    const second = panels.nth(1);
    await expect(second).toContainText("00112233");
    await expect(second).toContainText("no skills");
    await expect(second).not.toContainText("uncommitted changes");
  });
});
