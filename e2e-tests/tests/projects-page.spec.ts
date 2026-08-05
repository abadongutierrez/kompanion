import { test, expect } from "@playwright/test";
import { ensureProjectAndTeam } from "./fixtures.js";

test.describe("projects page", () => {
  let projectName: string;

  test.beforeAll(async ({ request }) => {
    const { projectId } = await ensureProjectAndTeam(request);
    const project = await request
      .get("/api/projects")
      .then((r) => r.json())
      .then((projects: { id: string; name: string }[]) =>
        projects.find((p) => p.id === projectId),
      );
    projectName = project!.name;
  });

  test("root shows the projects list, and clicking one opens its board", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

    const projectLink = page.getByRole("link", { name: new RegExp(projectName) });
    await expect(projectLink).toBeVisible();
    await projectLink.click();

    await expect(page).toHaveURL(/\/projects\/[^/]+\/board$/);
    await expect(page.getByRole("button", { name: "+ New Task" })).toBeVisible();
    // The project name is shown in the shell's header once inside it, and
    // a link back to the root list is always available.
    await expect(page.getByText(projectName)).toBeVisible();
    await expect(page.getByRole("link", { name: "← Projects" })).toBeVisible();
  });

  test("navigating back to / always shows the list, never auto-redirects into a project", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("http://localhost:5173/");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });
});
