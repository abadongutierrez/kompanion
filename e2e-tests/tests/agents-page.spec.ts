import { test, expect } from "@playwright/test";

// Creating and editing an agent each live on their own route now
// (/agents/new and /agents/:agentId) — the library page at /agents only
// lists them. Agents have no delete endpoint, so this suite leaves one
// agent behind per run, exactly like a real operator clicking through the
// same screens would.
test.describe("agent pages", () => {
  let harnessPath: string;

  test.beforeAll(async ({ request }) => {
    // Reuse an existing agent's harness folder: it is a real directory on
    // disk, which the server validates on create.
    const agents: { harnessPath: string }[] = await request
      .get("/api/agents")
      .then((r) => r.json());
    harnessPath = agents[0].harnessPath;
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

  test("an unknown agent id says so instead of showing an empty form", async ({ page }) => {
    await page.goto("/agents/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Agent not found.")).toBeVisible();
  });
});
