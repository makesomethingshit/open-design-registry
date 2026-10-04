import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: process.env.PLAYWRIGHT_SERVER_COMMAND ?? "npm run dev -- --hostname 127.0.0.1", url: `${baseURL}/login`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
