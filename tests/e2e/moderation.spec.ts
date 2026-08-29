import { expect, test } from "@playwright/test";

import {
  cleanupAccounts,
  closePool,
  createAccount,
  createServer,
  grantPlatformRole,
  markServerVerified,
  openPool,
  publishServer,
} from "./helpers";

const createdEmails: string[] = [];

test.afterAll(async () => {
  await cleanupAccounts(createdEmails);
});

test("a server report can be hidden, restored and dismissed by moderation", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const owner = await createAccount(page, "report-owner");
  createdEmails.push(owner.email);
  const { name: serverName, slug } = await createServer(page, {
    name: `E2E Reported Server ${Date.now()}`,
    javaHost: `reported-${Date.now()}.example.invalid`,
  });
  await markServerVerified(slug);
  await publishServer(page, slug);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/servers/${slug}`);
  const reviewSignIn = guest
    .locator('[data-slot="card"]')
    .filter({ hasText: "Comparte tu opinión sobre este servidor" })
    .getByRole("link", { name: "Iniciar sesión", exact: true });
  await expect(reviewSignIn).toBeVisible();
  const reviewHeight = await reviewSignIn.evaluate((element) => element.getBoundingClientRect().height);
  expect(reviewHeight).toBeGreaterThanOrEqual(40);
  const guestReportForm = guest.locator("form").filter({ hasText: "Motivo del reporte" });
  const guestReportControlHeights = await guestReportForm.locator("input, select, button").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(guestReportControlHeights).toHaveLength(3);
  expect(guestReportControlHeights.every((height) => height >= 40)).toBe(true);
  await guestContext.close();

  const reporterContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  const reporterAccount = await createAccount(reporter, "reporter");
  createdEmails.push(reporterAccount.email);
  await reporter.goto(`/servers/${slug}`);
  const reportForm = reporter.locator("form").filter({ hasText: "Motivo del reporte" });
  await reportForm.locator("select").selectOption("offline");
  await reportForm.getByLabel("Detalles opcionales").fill("El servidor no responde.");
  await reportForm.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(reporter.getByRole("alert").filter({ hasText: "Hemos recibido" })).toBeVisible();

  const moderatorContext = await browser.newContext();
  const moderator = await moderatorContext.newPage();
  const moderatorAccount = await createAccount(moderator, "moderator");
  createdEmails.push(moderatorAccount.email);
  await grantPlatformRole(moderatorAccount.email, "moderator");
  await moderator.goto("/admin");
  const report = moderator.locator("article").filter({ hasText: serverName }).first();
  await report.getByRole("button", { name: "Revisar" }).click();
  await moderator.getByRole("dialog").getByRole("button", { name: "Ocultar" }).click();
  await moderator.getByRole("alertdialog").getByRole("button", { name: "Sí, ocultar" }).click();
  await expect(moderator).toHaveURL(/\/admin\?updated=1$/);

  await reporter.goto("/");
  await expect(reporter.getByRole("heading", { name: serverName })).toHaveCount(0);

  await moderator.goto("/admin?status=actioned");
  const resolved = moderator.locator("article").filter({ hasText: serverName }).first();
  await resolved.getByRole("button", { name: "Revisar" }).click();
  await moderator.getByRole("dialog").getByRole("button", { name: "Restaurar" }).click();
  await moderator.getByRole("alertdialog").getByRole("button", { name: "Sí, restaurar" }).click();
  await expect(moderator).toHaveURL(/\/admin\?updated=1$/);
  await reporter.goto(`/servers/${slug}`);
  await expect(reporter.getByRole("heading", { name: serverName })).toBeVisible();

  await reporter.goto(`/servers/${slug}`);
  const secondReportForm = reporter.locator("form").filter({ hasText: "Motivo del reporte" });
  await secondReportForm.locator("select").selectOption("other");
  await secondReportForm.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(reporter.getByRole("alert").filter({ hasText: "Hemos recibido" })).toBeVisible();
  await moderator.goto("/admin");
  await moderator.locator("article").filter({ hasText: serverName }).first().getByRole("button", { name: "Revisar" }).click();
  await moderator.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
  await moderator.getByRole("alertdialog").getByRole("button", { name: "Sí, descartar" }).click();
  await expect(moderator).toHaveURL(/\/admin\?updated=1$/);
  await reporter.reload();
  await expect(reporter.getByRole("heading", { name: serverName })).toBeVisible();

  await moderator.goto("/admin?status=dismissed");
  await moderator.locator("article").filter({ hasText: serverName }).first().getByRole("button", { name: "Revisar" }).click();
  await moderator.getByRole("dialog").getByRole("button", { name: "Reabrir" }).click();
  await moderator.getByRole("alertdialog").getByRole("button", { name: "Sí, reabrir" }).click();
  await expect(moderator).toHaveURL(/\/admin\?updated=1$/);
  await moderator.goto("/admin");
  await expect(moderator.locator("article").filter({ hasText: serverName }).first()).toBeVisible();

  await reporterContext.close();
  await moderatorContext.close();
});

test("an admin can grant a platform role and a moderator cannot see role management", async ({ page, browser }) => {
  const admin = await createAccount(page, "admin");
  createdEmails.push(admin.email);
  const targetContext = await browser.newContext();
  const target = await targetContext.newPage();
  const targetAccount = await createAccount(target, "role-target");
  createdEmails.push(targetAccount.email);
  await grantPlatformRole(admin.email, "admin");

  await page.goto("/admin");
  await expect(page.getByText("Gestionar roles")).toBeVisible();
  await page.locator('input[name="email"]').fill(targetAccount.email);
  await page.locator('select[name="role"]').selectOption("moderator");
  await page.getByRole("button", { name: "Conceder" }).click();
  await expect(page).toHaveURL(/\/admin\?updated=1$/);

  const pool = openPool();
  try {
    const result = await pool.query(
      'select role from platform_roles where user_id = (select id from "user" where email = $1)',
      [targetAccount.email],
    );
    expect(result.rows[0]?.role).toBe("moderator");
  } finally {
    await closePool();
  }

  await target.goto("/admin");
  await expect(target.getByText("Gestionar roles")).toHaveCount(0);
  await targetContext.close();
});
