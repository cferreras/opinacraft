import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const e2ePort = process.env.E2E_PORT ?? "3101";
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${e2ePort}`;

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Set TEST_DATABASE_URL before running E2E tests. Use a dedicated test database, never Production.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
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
        command: `corepack pnpm exec next dev --hostname 127.0.0.1 --port ${e2ePort}`,
        url: baseURL,
        reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === "true",
        timeout: 120_000,
        env: {
          NEXT_DIST_DIR: ".next-e2e",
          DATABASE_URL: process.env.TEST_DATABASE_URL!,
          BETTER_AUTH_SECRET: "e2e-test-secret-that-is-at-least-32-characters",
          BETTER_AUTH_URL: baseURL,
          BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
          SERVER_VERIFICATION_SECRET: "e2e-verification-secret-that-is-at-least-32-characters",
          DISCORD_CLIENT_ID: "",
          DISCORD_CLIENT_SECRET: "",
          // E2E captures verification/reset flows without contacting Resend.
          E2E_DISABLE_EMAIL: "true",
          E2E_MEDIA_STORAGE: "memory",
          RESEND_API_KEY: "",
          EMAIL_FROM: "",
          BLOB_READ_WRITE_TOKEN: "",
          BLOB_OPERATOR_EMAIL: "",
        },
      },
});
