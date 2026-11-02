import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the real product in Chromium: the API and the web app
 * are started here with a dedicated, freshly seeded embedded database, so a run
 * never depends on whatever state a developer left behind.
 *
 * Ports are distinct from the dev servers (3400/5183) so `bun run dev` can keep
 * running while the suite executes.
 */
const API_PORT = 3410;
const WEB_PORT = 5193;
const E2E_DIR = ".data/e2e";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun run e2e/support/start-api.ts",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `bun run --cwd apps/web dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_TARGET: `http://localhost:${API_PORT}` },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

export { API_PORT, WEB_PORT, E2E_DIR };
