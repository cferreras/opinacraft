import { expect, test } from "@playwright/test";

import {
  cleanupAccounts,
  closePool,
  createAccount,
  makeEmailChangeToken,
  makeEmailVerificationToken,
  openPool,
  setOnlySocialAccount,
} from "./helpers";

const createdEmails: string[] = [];

test.afterAll(async () => {
  await cleanupAccounts(createdEmails);
});

test("a user can edit their public profile and request an email change", async ({ page }) => {
  const account = await createAccount(page, "profile-edit");
  createdEmails.push(account.email);

  await page.getByLabel("Nombre visible").fill("OpinaCraft Explorer");
  await page.getByLabel("Avatar").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(page.getByText("OpinaCraft Explorer", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Perfil actualizado.")).toBeVisible({ timeout: 15_000 });

  const pool = openPool();
  try {
  const profileResult = await pool.query(
    'select name, image, image_key, image_bytes, email, email_verified from "user" where email = $1',
    [account.email],
  );
  expect(profileResult.rows[0]).toMatchObject({ name: "OpinaCraft Explorer", email: account.email, email_verified: true });
  expect(profileResult.rows[0]?.image).toMatch(/^data:image\/webp;base64,/);
  expect(profileResult.rows[0]?.image_key).toMatch(/^avatars\//);
  expect(profileResult.rows[0]?.image_bytes).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Quitar avatar" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Perfil actualizado.")).toBeVisible({ timeout: 15_000 });
  const clearedProfileResult = await pool.query(
    'select image, image_key, image_bytes from "user" where email = $1',
    [account.email],
  );
  expect(clearedProfileResult.rows[0]).toMatchObject({ image: null, image_key: null, image_bytes: null });

  await page.getByLabel("Nombre visible").fill(" ");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("El nombre debe tener al menos 2 caracteres.")).toBeVisible();

  await page.getByLabel("Nombre visible").fill("OpinaCraft Explorer");
  const nextEmail = `e2e-profile-next-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.invalid`;
  await page.getByLabel("Nuevo correo electrónico").fill(account.email);
  await page.getByRole("button", { name: "Solicitar cambio" }).click();
  await expect(page.getByText("Escribe un correo diferente al actual.")).toBeVisible();

  await page.getByLabel("Nuevo correo electrónico").fill(nextEmail);
  await page.getByRole("button", { name: "Solicitar cambio" }).click();
  await expect(page.getByText(/Revisa tu correo actual para aprobar el cambio/)).toBeVisible();

  const pendingEmailResult = await pool.query(
    'select email from "user" where email = $1',
    [account.email],
  );
  expect(pendingEmailResult.rows[0]?.email).toBe(account.email);
  await expect(page.getByLabel("Nuevo correo electrónico")).toHaveValue(nextEmail);

  await page.request.get(
    `/api/auth/verify-email?token=${encodeURIComponent(makeEmailChangeToken(account.email, nextEmail, "change-email-confirmation"))}`,
  );
  await page.goto(
    `/api/auth/verify-email?token=${encodeURIComponent(makeEmailChangeToken(account.email, nextEmail, "change-email-verification"))}&callbackURL=${encodeURIComponent("/profile")}`,
  );
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto(
    `/api/auth/verify-email?token=${encodeURIComponent(makeEmailVerificationToken(nextEmail))}&callbackURL=${encodeURIComponent("/profile")}`,
  );
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Nuevo correo electrónico")).toHaveValue(nextEmail);

  createdEmails.push(nextEmail);
  const changedEmailResult = await pool.query(
    'select email, email_verified from "user" where email = $1',
    [nextEmail],
  );
  expect(changedEmailResult.rows[0]).toMatchObject({ email: nextEmail, email_verified: true });
  } finally {
    await closePool();
  }
});

test("a Discord-only account can edit its profile without a local password", async ({ page }) => {
  const account = await createAccount(page, "profile-discord");
  createdEmails.push(account.email);
  await setOnlySocialAccount(account.email);

  await page.goto("/profile");
  await page.getByRole("tab", { name: "Seguridad" }).click();
  await expect(page.getByText("Acceso administrado por Discord")).toBeVisible();
  await expect(page.getByText("Esta cuenta no tiene una contraseña local.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cambiar contraseña" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Identidad" }).click();
  await page.getByLabel("Nombre visible").fill("Discord Explorer");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Discord Explorer", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Perfil actualizado.")).toBeVisible();

  const pool = openPool();
  try {
  const accountResult = await pool.query(
    'select provider_id from "account" where user_id = (select id from "user" where email = $1)',
    [account.email],
  );
  expect(accountResult.rows).toEqual([{ provider_id: "discord" }]);
  } finally {
    await closePool();
  }
});
