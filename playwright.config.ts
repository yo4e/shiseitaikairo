import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4323",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run db:reset:smoke && npm run db:migrate:smoke && npm run dev:smoke",
    url: "http://127.0.0.1:4323/cabinet",
    timeout: 120_000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
