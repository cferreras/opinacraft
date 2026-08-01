import { createHmac } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import pg from "pg";

const { Pool } = pg;

export const E2E_PASSWORD = "e2e-password-123";
export const E2E_NEW_PASSWORD = "e2e-password-456";
export const E2E_AUTH_SECRET = "e2e-test-secret-that-is-at-least-32-characters";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required by the E2E helpers.");
}

export function openPool() {
  return new Pool({ connectionString: testDatabaseUrl, max: 1 });
}

export async function clearRateLimits() {
  const pool = openPool();
  try {
    await pool.query("delete from rate_limit");
  } finally {
    await pool.end();
  }
}

export async function setEmailVerified(email: string, verified = true) {
  const pool = openPool();
  try {
    await pool.query('update "user" set email_verified = $1 where email = $2', [verified, email]);
  } finally {
    await pool.end();
  }
}

export async function createAccount(
  page: Page,
  label: string,
  options: { verified?: boolean } = {},
) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.invalid`;
  const verified = options.verified ?? true;

  await clearRateLimits();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(`E2E ${label}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Cuenta creada")).toBeVisible();

  await setEmailVerified(email, verified);
  if (verified) {
    await signIn(page, email, E2E_PASSWORD);
  }

  return { email, password: E2E_PASSWORD };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
}

export async function createServer(
  page: Page,
  options: {
    name: string;
    javaHost?: string;
    javaPort?: number;
    bedrockHost?: string;
    bedrockPort?: number;
    description?: string;
    websiteUrl?: string;
    discordUrl?: string;
    tags?: string[];
  },
) {
  await page.goto("/servers/new");
  await page.getByLabel("Nombre", { exact: true }).fill(options.name);
  if (options.description) await page.getByLabel("Descripción", { exact: true }).fill(options.description);
  if (options.websiteUrl) await page.getByLabel("Sitio web", { exact: true }).fill(options.websiteUrl);
  if (options.discordUrl) await page.getByLabel("Invitación de Discord", { exact: true }).fill(options.discordUrl);

  const javaHost = options.javaHost ?? `java-${Date.now()}.example.invalid`;
  await page.locator('input[name="javaHost"]').fill(javaHost);
  if (options.javaPort !== undefined) await page.locator('input[name="javaPort"]').fill(String(options.javaPort));

  if (options.bedrockHost) {
    await page.locator('input[name="bedrockEnabled"]').check();
    await page.locator('input[name="bedrockHost"]').fill(options.bedrockHost);
    if (options.bedrockPort !== undefined) await page.locator('input[name="bedrockPort"]').fill(String(options.bedrockPort));
  }

  if (options.tags?.length) {
    const tagInput = page.locator('input[role="combobox"][aria-label]').first();
    for (const tag of options.tags) {
      await tagInput.fill(tag);
      await tagInput.press("Enter");
    }
  }

  await page.getByRole("button", { name: "Crear servidor" }).click();
  await expect(page).toHaveURL(/\/servers\/[^/]+\/manage\?created=1$/);

  const slug = new URL(page.url()).pathname.split("/")[2];
  if (!slug) throw new Error("The created server did not have a slug.");
  return { slug, name: options.name };
}

export async function markServerVerified(slug: string, editions: Array<"java" | "bedrock"> = ["java"]) {
  const pool = openPool();
  try {
    await pool.query(
      "update server_endpoints set verification_status = 'verified' where edition = any($1::minecraft_edition[]) and server_id = (select id from servers where slug = $2)",
      [editions, slug],
    );
    await pool.query(
      "update servers set verification_status = 'verified', verified_at = now() where slug = $1",
      [slug],
    );
  } finally {
    await pool.end();
  }
}

export async function publishServer(page: Page, slug: string) {
  await page.getByLabel("Publication").selectOption("published");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));
}

export async function setEndpointHealth(slug: string, edition: "java" | "bedrock", health: "online" | "offline") {
  const pool = openPool();
  try {
    await pool.query(
      "update server_endpoints set health_status = $1, last_checked_at = now(), verification_status = 'verified' where edition = $2 and server_id = (select id from servers where slug = $3)",
      [health, edition, slug],
    );
  } finally {
    await pool.end();
  }
}

export async function grantPlatformRole(email: string, role: "moderator" | "admin") {
  const pool = openPool();
  try {
    await pool.query(
      "insert into platform_roles (user_id, role) select id, $1 from \"user\" where email = $2 on conflict (user_id) do update set role = excluded.role",
      [role, email],
    );
  } finally {
    await pool.end();
  }
}

export async function getServerId(slug: string) {
  const pool = openPool();
  try {
    const result = await pool.query("select id from servers where slug = $1", [slug]);
    return result.rows[0]?.id as string | undefined;
  } finally {
    await pool.end();
  }
}

export async function cleanupAccounts(emails: string[]) {
  if (!emails.length) return;
  const pool = openPool();
  try {
    await pool.query(
      'delete from servers where id in (select server_id from server_members where user_id in (select id from "user" where email = any($1::text[])))',
      [emails],
    );
    await pool.query(
      'delete from server_members where user_id in (select id from "user" where email = any($1::text[]))',
      [emails],
    );
    await pool.query('delete from "user" where email = any($1::text[])', [emails]);
  } finally {
    await pool.end();
  }
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function makeEmailVerificationToken(email: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256" }));
  const payload = base64Url(JSON.stringify({ email: email.toLowerCase(), iat: now, exp: now + 3600 }));
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", E2E_AUTH_SECRET).update(input).digest("base64url");
  return `${input}.${signature}`;
}

export async function requestPasswordReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists/i)).toBeVisible();

  const pool = openPool();
  try {
    const result = await pool.query(
      "select identifier from verification where identifier like 'reset-password:%' order by created_at desc limit 1",
    );
    const identifier = result.rows[0]?.identifier as string | undefined;
    if (!identifier) throw new Error("The reset token was not created.");
    return identifier.replace("reset-password:", "");
  } finally {
    await pool.end();
  }
}
