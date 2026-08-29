import { expect, test } from "@playwright/test";

import {
  E2E_NEW_PASSWORD,
  E2E_PASSWORD,
  cleanupAccounts,
  closePool,
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

test("authenticated navigation links to the profile instead of sign-in", async ({ page }) => {
  const account = await createAccount(page, "header-profile");
  createdEmails.push(account.email);

  await page.goto("/");
  await page.getByRole("button", { name: "Abrir mi perfil" }).click();
  await expect(page.getByRole("menuitem", { name: "Mi perfil" })).toBeVisible();
  await expect(page.locator('header a[href="/sign-in"]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.locator('a[href="/profile"]:visible').first()).toBeVisible();
  await expect(page.locator('header a[href="/sign-in"]')).toHaveCount(0);

  await page.locator('a[href="/profile"]:visible').first().click();
  await expect(page).toHaveURL(/\/profile$/);
});

test("an account can verify its email without sending a real message", async ({ page }) => {
  const account = await createAccount(page, "email-verification", { verified: false });
  createdEmails.push(account.email);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Contrase\u00f1a").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesi\u00f3n" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email not verified" })).toBeVisible();

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
    await closePool();
  }

  await signIn(page, account.email, E2E_PASSWORD);
});

test("a duplicate registration explains that the email already has an account", async ({ page }) => {
  const account = await createAccount(page, "duplicate-sign-up");
  createdEmails.push(account.email);
  await page.context().clearCookies();

  await page.goto("/sign-up");
  await page.getByLabel("Nombre").fill("E2E Duplicate");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Ya existe una cuenta con ese correo." })).toBeVisible();
  await expect(page.getByText("Cuenta creada")).toHaveCount(0);
});

test("password reset and password change work without Resend", async ({ page }) => {
  const account = await createAccount(page, "password-flow");
  createdEmails.push(account.email);

  const token = await requestPasswordReset(page, account.email);
  await page.goto(
    `/api/auth/reset-password/${encodeURIComponent(token)}?callbackURL=${encodeURIComponent("/reset-password")}`,
  );
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("Nueva contrase\u00f1a").fill(E2E_NEW_PASSWORD);
  await page.getByLabel("Confirmar contrase\u00f1a").fill(E2E_NEW_PASSWORD);
  await page.getByRole("button", { name: "Actualizar contrase\u00f1a" }).click();
  await expect(page).toHaveURL(/\/sign-in\?reset=success$/);
  await signIn(page, account.email, E2E_NEW_PASSWORD);

  await page.getByRole("tab", { name: "Seguridad" }).click();
  await page.getByRole("link", { name: "Cambiar contrase\u00f1a" }).click();
  await page.getByLabel("Contrase\u00f1a actual").fill(E2E_NEW_PASSWORD);
  await page.getByLabel("Nueva contrase\u00f1a", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirmar contrase\u00f1a").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Cambiar contrase\u00f1a" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("tab", { name: "Cuenta" }).click();
  await page.getByRole("button", { name: "Cerrar sesi\u00f3n" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, account.email, E2E_PASSWORD);
});

test("a user can export and delete the account from the profile", async ({ page }) => {
  const account = await createAccount(page, "account-lifecycle");
  createdEmails.push(account.email);

  await page.getByRole("tab", { name: "Seguridad" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar mis datos" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("opinacraft-cuenta.json");

  await page.getByRole("tab", { name: "Cuenta" }).click();
  await page.getByRole("button", { name: "Borrar cuenta" }).click();
  await page.getByLabel("Confirmaci\u00f3n").fill("DELETE ACCOUNT");
  await page.getByRole("button", { name: "Eliminar permanentemente" }).click();
  await expect(page).toHaveURL(/\/(?:sign-in)?$/);

  const pool = openPool();
  try {
    const result = await pool.query('select count(*)::int as count from "user" where email = $1', [account.email]);
    expect(result.rows[0]?.count).toBe(0);
  } finally {
    await closePool();
  }
});
