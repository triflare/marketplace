import { defineConfig, devices } from "@playwright/test"

const API_URL = "http://127.0.0.1:3200/v2"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node tests/mock-api.mjs",
      url: `${API_URL}/meta`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx react-router dev --host 127.0.0.1 --port 3101 --strictPort",
      url: "http://127.0.0.1:3101",
      env: {
        TWEXTHUB_API_URL: API_URL,
        VITE_TWEXTHUB_API_URL: API_URL,
        SESSION_SECRET: "playwright-session-secret",
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
