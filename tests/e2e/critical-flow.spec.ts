import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const createdEmails: string[] = [];

test.afterAll(async () => {
  if (!testDatabaseUrl || !createdEmails.length) return;

  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try {
    const userIdsResult = await pool.query(
      'select id from "user" where email = any($1::text[])',
      [createdEmails],
    );
    const userIds = userIdsResult.rows.map(row => row.id);

    if (userIds.length > 0) {
      await pool.query(
        'delete from servers where id in (select server_id from server_members where user_id = any($1::text[]))',
        [userIds],
      );
    }
    await pool.query('delete from "user" where email = any($1::text[])', [createdEmails]);
  } finally {
    await pool.end();
  }
});

async function createAccount(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.invalid`;
  createdEmails.push(email);
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try { await pool.query('update "user" set email_verified = true where email = $1', [email]); } finally { await pool.end(); }
  return email;
}

async function createAndPublishServer(page: Page, name: string, host: string) {
  await page.goto("/servers/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Host", { exact: true }).fill(host);
  await page.getByRole("button", { name: "Crear servidor" }).click();
  await expect(page).toHaveURL(/\/servers\/[^/]+\/manage\?created=1$/);

  const manageUrl = new URL(page.url());
  const slug = manageUrl.pathname.split("/")[2];
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try {
    await pool.query("update server_endpoints set verification_status = 'verified' where server_id = (select id from servers where slug = $1)", [slug]);
    await pool.query("update servers set verification_status = 'verified', verified_at = now() where slug = $1", [slug]);
  } finally { await pool.end(); }
  await page.getByLabel("Publication").selectOption("published");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));
  return { slug, manageUrl };
}

test("owner can create, publish, browse and manage a server", async ({ page }) => {
  await createAccount(page);
  const serverName = `E2E Community ${Date.now()}`;
  const { slug } = await createAndPublishServer(page, serverName, "e2e.example.invalid");

  await page.goto("/servers");
  const card = page.locator("article").filter({ hasText: serverName });
  await expect(card.getByRole("heading", { name: serverName })).toBeVisible();
  await card.getByRole("link", { name: "Ver servidor" }).click();
  await expect(page).toHaveURL(`/servers/${slug}`);
  await expect(page.getByRole("heading", { name: serverName })).toBeVisible();

  await page.goto(`/servers/${slug}/manage`);
  await expect(page.getByRole("heading", { name: `Manage ${serverName}` })).toBeVisible();
});

test("verification reports a controlled offline error without a Minecraft server", async ({ page }) => {
  await createAccount(page);
  const serverName = `E2E Offline ${Date.now()}`;
  const { slug } = await createAndPublishServer(page, serverName, "offline.example.invalid");

  await page.goto(`/servers/${slug}/manage`);
  await page.getByRole("button", { name: "Generate verification code" }).click();
  await expect(page.getByRole("button", { name: "Check MOTD" })).toBeVisible();
  await page.getByRole("button", { name: "Check MOTD" }).click();

  await expect(page.getByText(/offline or did not respond in time/i)).toBeVisible();
});
