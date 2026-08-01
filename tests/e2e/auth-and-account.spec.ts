import { expect, test } from "@playwright/test";

import {
  E2E_NEW_PASSWORD,
  E2E_PASSWORD,
  cleanupAccounts,
  createAccount,
  makeEmailVerificationToken,
  openPool,
  requestPasswordReset,
  signIn,
} from "./helpers";

const createdEmails: string[] = [];

test.afterAll(async () => {
  await cleanupAccounts(createdEmails);
});

test("an account can verify its email without sending a real message", async ({ page }) => {
  const account = await createAccount(page, "email-verification", { verified: false });
  createdEmails.push(account.email);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/profile$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  const token = makeEmailVerificationToken(account.email);
  await page.goto(
    `/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent("/sign-in")}`,
  );
  await expect(page).toHaveURL(/\/sign-in$/);

  const pool = openPool();
  try {
    const result = await pool.query('select email_verified from "user" where email = $1', [account.email]);
    expect(result.rows[0]?.email_verified).toBe(true);
  } finally {
    await pool.end();
  }

  await signIn(page, account.email, E2E_PASSWORD);
});

test("password reset and password change work without Resend", async ({ page }) => {
  const account = await createAccount(page, "password-flow");
  createdEmails.push(account.email);

  const token = await requestPasswordReset(page, account.email);
  await page.goto(
    `/api/auth/reset-password/${encodeURIComponent(token)}?callbackURL=${encodeURIComponent("/reset-password")}`,
  );
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New password").fill(E2E_NEW_PASSWORD);
  await page.getByLabel("Confirm password").fill(E2E_NEW_PASSWORD);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/sign-in\?reset=success$/);
  await signIn(page, account.email, E2E_NEW_PASSWORD);

  await page.getByRole("link", { name: "Change password" }).click();
  await page.getByLabel("Current password").fill(E2E_NEW_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirm new password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, account.email, E2E_PASSWORD);
});

test("a user can export and delete the account from the profile", async ({ page }) => {
  const account = await createAccount(page, "account-lifecycle");
  createdEmails.push(account.email);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar mis datos" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("opinacraft-cuenta.json");
  await expect(page.locator("p").filter({ hasText: /Export|descarg/i })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("prompt");
    await dialog.accept("DELETE ACCOUNT");
  });
  await page.getByRole("button", { name: "Borrar cuenta" }).click();
  await expect(page).toHaveURL(/\/$/);

  const pool = openPool();
  try {
    const result = await pool.query('select count(*)::int as count from "user" where email = $1', [account.email]);
    expect(result.rows[0]?.count).toBe(0);
  } finally {
    await pool.end();
  }
});
