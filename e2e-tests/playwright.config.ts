import { defineConfig, devices } from "@playwright/test";

// This suite drives the real UI (ui/) against whatever backend it's
// currently proxying to (see ui/vite.config.ts's /api proxy target — as of
// the Kotlin port cutover, that's server-kotlin on :3200). It assumes
// Postgres and that backend are already running (see README.md); it only
// takes responsibility for the UI dev server itself.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
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
    command: "pnpm --filter @kompanion/ui dev",
    cwd: "..",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
