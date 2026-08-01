import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const createdEmails: string[] = [];

test.afterAll(async () => {
  if (!testDatabaseUrl || !createdEmails.length) return;
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try {
    const users = await pool.query('select id from "user" where email = any($1::text[])', [createdEmails]);
    const ids = users.rows.map((row) => row.id);
    if (ids.length) await pool.query('delete from servers where id in (select server_id from server_members where user_id = any($1::text[]))', [ids]);
    await pool.query('delete from "user" where email = any($1::text[])', [createdEmails]);
  } finally {
    await pool.end();
  }
});

async function createAccount(page: Page, label: string) {
  const email = `review-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.invalid`;
  createdEmails.push(email);
  const rateLimitPool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try { await rateLimitPool.query("delete from rate_limit"); } finally { await rateLimitPool.end(); }
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(`E2E ${label}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Cuenta creada")).toBeVisible();
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try { await pool.query('update "user" set email_verified = true where email = $1', [email]); } finally { await pool.end(); }
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  return email;
}

async function createAndPublishServer(page: Page) {
  const name = `E2E Reviews ${Date.now()}`;
  await page.goto("/servers/new");
  await page.getByLabel("Nombre", { exact: true }).fill(name);
  await page.getByLabel("Host", { exact: true }).fill(`reviews-${Date.now()}.example.invalid`);
  await page.getByRole("button", { name: "Crear servidor" }).click();
  await expect(page).toHaveURL(/\/servers\/[^/]+\/manage\?created=1$/);
  const slug = new URL(page.url()).pathname.split("/")[2];
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try {
    await pool.query("update server_endpoints set verification_status = 'verified' where server_id = (select id from servers where slug = $1)", [slug]);
    await pool.query("update servers set verification_status = 'verified', verified_at = now() where slug = $1", [slug]);
  } finally { await pool.end(); }
  await page.getByLabel("Publication").selectOption("published");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));
  return { name, slug };
}

async function signOut(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

test("verified player can publish, edit, delete and receive an official reply", async ({ page }) => {
  await createAccount(page, "owner");
  const { slug } = await createAndPublishServer(page);
  const reviewerContext = await page.context().browser()!.newContext();
  const reviewer = await reviewerContext.newPage();
  await createAccount(reviewer, "player");

  await reviewer.goto(`/servers/${slug}#reviews`);
  await reviewer.getByRole("radio", { name: "5 estrellas" }).check({ force: true });
  await reviewer.getByLabel("Comentario").fill("Una comunidad muy activa y agradable");
  await reviewer.getByRole("button", { name: "Publicar opinión" }).click();
  await expect(reviewer).toHaveURL(new RegExp(`/servers/${slug}\\?review=created`));
  await expect(
    reviewer.getByRole("paragraph").filter({ hasText: "Una comunidad muy activa y agradable" }),
  ).toBeVisible();

  await page.goto(`/servers/${slug}#reviews`);
  await page.getByLabel("Respuesta oficial").fill("Gracias por compartir tu experiencia");
  await page.getByRole("button", { name: "Responder oficialmente" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}\\?reply=created`));
  await expect(
    page.getByRole("paragraph").filter({ hasText: "Gracias por compartir tu experiencia" }),
  ).toBeVisible();

  await page.getByLabel("Editar respuesta oficial").fill("Respuesta oficial actualizada desde E2E");
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}\\?reply=updated`));
  await expect(page.getByRole("paragraph").filter({ hasText: "Respuesta oficial actualizada desde E2E" })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}\\?reply=deleted`));

  await reviewer.getByLabel("Comentario").fill("Una comunidad todavía mejor organizada");
  await reviewer.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(reviewer).toHaveURL(new RegExp(`/servers/${slug}\\?review=updated`));
  await reviewer.getByRole("button", { name: "Eliminar opinión" }).click();
  await expect(reviewer).toHaveURL(new RegExp(`/servers/${slug}\\?review=deleted`));
  await expect(reviewer.getByText("Has eliminado tu opinión")).toBeVisible();
  await reviewerContext.close();
});

test("a reported opinion can be hidden and restored by moderation", async ({ page, browser }) => {
  await createAccount(page, "owner-moderation");
  const { slug } = await createAndPublishServer(page);
  const reviewerContext = await browser.newContext();
  const reviewer = await reviewerContext.newPage();
  await createAccount(reviewer, "reviewer-moderation");
  await reviewer.goto(`/servers/${slug}#reviews`);
  await reviewer.getByRole("radio", { name: "4 estrellas" }).check({ force: true });
  await reviewer.getByLabel("Comentario").fill("La experiencia merece una revisión");
  await reviewer.getByRole("button", { name: "Publicar opinión" }).click();

  const reporterContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  await createAccount(reporter, "reporter-moderation");
  await reporter.goto(`/servers/${slug}#reviews`);
  await reporter.getByText("Reportar opinión").click();
  await reporter.getByLabel("Motivo").selectOption("offensive");
  await reporter.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(reporter.getByRole("status")).toContainText("Hemos recibido");

  await signOut(page);
  await createAccount(page, "moderator");
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try {
    await pool.query('insert into platform_roles (user_id, role) select id, \'moderator\' from "user" where email = $1 on conflict (user_id) do update set role = \'moderator\'', [createdEmails.at(-1)]);
  } finally { await pool.end(); }
  await page.goto("/admin");
  const report = page.locator("article").filter({ hasText: "La experiencia merece una revisión" });
  await report.getByRole("button", { name: "Ocultar opinión" }).click();
  await expect(page).toHaveURL(/\/admin\?updated=1/);

  await reviewer.goto(`/servers/${slug}#reviews`);
  const reviewsSection = reviewer.locator("#reviews");
  await expect(reviewsSection.getByText("—", { exact: true })).toBeVisible();

  await page.goto("/admin?status=actioned");
  const resolved = page.locator("article").filter({ hasText: "La experiencia merece una revisión" });
  await resolved.getByRole("button", { name: "Restaurar" }).click();
  await expect(page).toHaveURL(/\/admin\?updated=1/);
  await reviewer.close();
  const restoredReviewer = await reviewerContext.newPage();
  await restoredReviewer.goto(`/servers/${slug}?fresh=${Date.now()}#reviews`, { waitUntil: "domcontentloaded" });
  await expect(restoredReviewer.getByText("4,0")).toBeVisible({ timeout: 10_000 });

  await reviewerContext.close();
  await reporterContext.close();
});
