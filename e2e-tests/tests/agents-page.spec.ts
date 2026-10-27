import { test, expect } from "@playwright/test";
import { ensureClaudeRuntime, type SeededRuntime } from "./fixtures.js";

// Creating and editing an agent each live on their own route now
// (/agents/new and /agents/:agentId) — the library page at /agents only
// lists them. Agents have no delete endpoint, so this suite leaves one
// agent behind per run, exactly like a real operator clicking through the
// same screens would.
test.describe("agent pages", () => {
  let harnessPath: string;
  let runtime: SeededRuntime;

  test.beforeAll(async ({ request }) => {
    // Reuse an existing agent's harness folder: it is a real directory on
    // disk, which the server validates on create.
    const agents: { harnessPath: string }[] = await request
      .get("/api/agents")
      .then((r) => r.json());
    harnessPath = agents[0].harnessPath;
    runtime = await ensureClaudeRuntime(request);
  });

  test("creating an agent happens on /agents/new and returns to the library", async ({ page }) => {
    const title = `E2E UI Agent ${Date.now()}`;

    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await page.getByRole("link", { name: "New agent" }).click();

    await expect(page).toHaveURL(/\/agents\/new$/);
    await expect(page.getByRole("heading", { name: "New agent" })).toBeVisible();
    // Slug and the harness template are edit-only — neither exists yet.
    await expect(page.getByLabel("Slug")).toHaveCount(0);
    await expect(page.getByLabel("Harness template")).toHaveCount(0);

    await page.getByLabel("Agent title").fill(title);
    await page.getByLabel("Harness folder path").fill(harnessPath);
    await page.getByRole("button", { name: "Create agent" }).click();

    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByText(title)).toBeVisible();
  });

  test("the Runtime select lists the runtimes from Settings and saves the choice", async ({ page, request }) => {
    const all: SeededRuntime[] = await request.get("/api/runtimes").then((r) => r.json());
    const title = `E2E UI Runtime ${Date.now()}`;

    await page.goto("/agents/new");
    const select = page.getByLabel("Runtime", { exact: true });
    // One option per configured runtime — nothing hardcoded, no separate kind
    // picker.
    await expect(select.locator("option:not([disabled])")).toHaveCount(all.length);
    await expect(page.getByLabel("Runtime instance")).toHaveCount(0);

    await page.getByLabel("Agent title").fill(title);
    await page.getByLabel("Harness folder path").fill(harnessPath);
    await select.selectOption(runtime.id);
    await page.getByRole("button", { name: "Create agent" }).click();
    await expect(page).toHaveURL(/\/agents$/);

    // The kind follows the chosen runtime, and the card shows its name.
    const agents: { title: string; runtime: string; runtimeId: string | null }[] = await request
      .get("/api/agents")
      .then((r) => r.json());
    const saved = agents.find((a) => a.title === title);
    expect(saved?.runtimeId).toBe(runtime.id);
    expect(saved?.runtime).toBe(runtime.kind);
    await expect(page.getByText(runtime.name).first()).toBeVisible();
  });

  test("editing an agent happens on its own /agents/:agentId page", async ({ page, request }) => {
    const created: { id: string; title: string } = await request
      .post("/api/agents", {
        data: { title: `E2E UI Edit ${Date.now()}`, harnessPath },
      })
      .then((r) => r.json());

    await page.goto("/agents");
    // Each card's Edit is a link to that agent's page, not an in-place form.
    await page.locator(`a[href="/agents/${created.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${created.id}$`));

    await expect(page.getByRole("heading", { name: "Edit agent" })).toBeVisible();
    await expect(page.getByLabel("Agent title")).toHaveValue(created.title);
    await expect(page.getByLabel("Harness folder path")).toHaveValue(harnessPath);
    await expect(page.getByLabel("Slug")).toBeVisible();
    await expect(page.getByLabel("Harness template")).toBeVisible();

    const renamed = `${created.title} (renamed)`;
    await page.getByLabel("Agent title").fill(renamed);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByText(renamed)).toBeVisible();
  });

  test("viewing an agent shows the edit fields read-only on /agents/:agentId/view", async ({ page, request }) => {
    const created: { id: string; title: string } = await request
      .post("/api/agents", {
        data: { title: `E2E UI View ${Date.now()}`, harnessPath },
      })
      .then((r) => r.json());

    await page.goto("/agents");
    await page.locator(`a[href="/agents/${created.id}/view"]`).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${created.id}/view$`));

    await expect(page.getByRole("heading", { name: created.title })).toBeVisible();
    // Same fields as Edit, none of them changeable. Text fields are read-only
    // rather than disabled so the keyboard can still reach and scroll them.
    for (const label of ["Agent title", "Slug", "Harness folder path", "Model", "Harness template"]) {
      const field = page.getByLabel(label, { exact: true });
      await expect(field).not.toBeEditable();
      await expect(field).toBeEnabled();
    }
    await expect(page.getByLabel("Runtime", { exact: true })).toBeDisabled();
    await page.getByLabel("Harness template").focus();
    await expect(page.getByLabel("Harness template")).toBeFocused();
    await expect(page.getByLabel("Agent title")).toHaveValue(created.title);
    await expect(page.getByLabel("Harness folder path")).toHaveValue(harnessPath);
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);

    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${created.id}$`));
    await expect(page.getByRole("heading", { name: "Edit agent" })).toBeVisible();
  });

  test("going back from an unsaved Edit to View shows the saved agent, not the draft", async ({ page, request }) => {
    const created: { id: string; title: string } = await request
      .post("/api/agents", {
        data: { title: `E2E UI Draft ${Date.now()}`, harnessPath },
      })
      .then((r) => r.json());

    await page.goto(`/agents/${created.id}/view`);
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit agent" })).toBeVisible();
    await page.getByLabel("Agent title").fill(`${created.title} (unsaved)`);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/agents/${created.id}/view$`));
    await expect(page.getByLabel("Agent title")).toHaveValue(created.title);
  });

  test("an unknown agent id says so instead of showing an empty form", async ({ page }) => {
    await page.goto("/agents/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Agent not found.")).toBeVisible();
  });

  test("QA: the view page shows the agent's skills locked and never writes", async ({ page, request }) => {
    const skills: { id: string; slug: string }[] = await request
      .get("/api/skills")
      .then((r) => r.json());
    test.skip(skills.length === 0, "needs at least one skill in the library");
    const skill = skills[0];

    const created: { id: string; title: string } = await request
      .post("/api/agents", {
        data: { title: `E2E QA View ${Date.now()}`, harnessPath, model: "qa-model" },
      })
      .then((r) => r.json());
    await request.put(`/api/agents/${created.id}/skills`, { data: { skillIds: [skill.id] } });

    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/") && r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
    });

    await page.goto(`/agents/${created.id}/view`);
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("qa-model");
    const box = page.getByRole("checkbox", { name: skill.slug, exact: true });
    await expect(box).toBeChecked();
    await expect(box).toBeDisabled();
    for (const cb of await page.getByRole("checkbox").all()) await expect(cb).toBeDisabled();

    // Clicking the skill's label and pressing Enter must not change or submit anything.
    await page.getByText(skill.slug, { exact: true }).click({ force: true });
    await expect(box).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/agents/${created.id}/view$`));
    expect(writes).toEqual([]);

    // Leaving View for Edit gives back editable fields.
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit agent" })).toBeVisible();
    await expect(page.getByLabel("Agent title")).toBeEnabled();
    await expect(page.getByRole("checkbox", { name: skill.slug, exact: true })).toBeEnabled();
  });

  test("QA: read-only view fields take focus in order, ignore typing and Enter, and never write", async ({ page, request }) => {
    const created: { id: string; title: string } = await request
      .post("/api/agents", {
        data: { title: `E2E QA Keys ${Date.now()}`, harnessPath, model: "qa-model" },
      })
      .then((r) => r.json());

    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/") && r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
    });

    await page.goto(`/agents/${created.id}/view`);
    await expect(page.getByLabel("Agent title")).toHaveValue(created.title);

    // Tab walks the read-only text fields in form order; the disabled
    // runtime select is skipped.
    await page.getByLabel("Agent title").focus();
    for (const label of ["Slug", "Harness folder path", "Model", "Harness template"]) {
      await page.keyboard.press("Tab");
      await expect(page.getByLabel(label, { exact: true })).toBeFocused();
    }

    // Typing into a read-only field changes nothing; Enter submits the form,
    // which must stay a no-op in View.
    await page.getByLabel("Agent title").focus();
    await page.keyboard.type("xyz");
    await expect(page.getByLabel("Agent title")).toHaveValue(created.title);
    await page.keyboard.press("Enter");
    await page.getByLabel("Model", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/agents/${created.id}/view$`));
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("QA: View → Edit (unsaved) → Back → Edit starts again from the saved values", async ({ page, request }) => {
    const created: { id: string; title: string } = await request
      .post("/api/agents", {
        data: { title: `E2E QA Reedit ${Date.now()}`, harnessPath, model: "saved-model" },
      })
      .then((r) => r.json());

    await page.goto(`/agents/${created.id}/view`);
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await page.getByLabel("Agent title").fill("draft title");
    await page.getByLabel("Model", { exact: true }).fill("draft-model");

    await page.goBack();
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("saved-model");
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit agent" })).toBeVisible();
    await expect(page.getByLabel("Agent title")).toHaveValue(created.title);
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("saved-model");
    await expect(page.getByLabel("Agent title")).toBeEditable();
  });

  test("QA: an unknown agent id on the view page says so", async ({ page }) => {
    await page.goto("/agents/00000000-0000-0000-0000-000000000000/view");
    await expect(page.getByText("Agent not found.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  });
});
