import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3000";

if (!externalBaseUrl && !process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Set TEST_DATABASE_URL before running local E2E tests. Use a dedicated test database, never Production.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev -- --hostname 127.0.0.1",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.TEST_DATABASE_URL!,
          BETTER_AUTH_SECRET: "e2e-test-secret-that-is-at-least-32-characters",
          BETTER_AUTH_URL: baseURL,
          BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
          SERVER_VERIFICATION_SECRET: "e2e-verification-secret-that-is-at-least-32-characters",
          DISCORD_CLIENT_ID: "",
          DISCORD_CLIENT_SECRET: "",
        },
      },
});
