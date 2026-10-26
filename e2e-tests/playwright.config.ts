import { defineConfig, devices } from "@playwright/test";

// This suite drives the real UI (ui/) against the Kotlin backend it proxies
// to (see ui/vite.config.ts's /api proxy target — server-kotlin on :3200).
// It assumes Postgres and that backend are already running (see README.md);
// it only takes responsibility for the UI dev server itself.
//
// UI_PORT and API_URL let a worktree test its own UI and server next to the
// ones already on :5173 and :3200.
const uiPort = process.env.UI_PORT ?? "5173";
const baseURL = `http://localhost:${uiPort}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm --filter @kompanion/ui dev --port ${uiPort} --strictPort`,
    cwd: "..",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
