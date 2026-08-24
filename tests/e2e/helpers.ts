import { createHmac } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import pg from "pg";

const { Pool } = pg;

export const E2E_PASSWORD = "e2e-password-123";
export const E2E_NEW_PASSWORD = "e2e-password-456";
export const E2E_AUTH_SECRET = "e2e-test-secret-that-is-at-least-32-characters";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let sharedPool: InstanceType<typeof Pool> | undefined;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required by the E2E helpers.");
}

export function openPool() {
  sharedPool ??= new Pool({ connectionString: testDatabaseUrl, max: 1 });
  return sharedPool;
}

export async function closePool() {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}

export async function clearRateLimits(rateLimitIp: string) {
  const pool = openPool();
  await pool.query("delete from rate_limit where key like $1", [`${rateLimitIp}|%`]);
}

export async function setEmailVerified(email: string, verified = true) {
  const pool = openPool();
  await pool.query('update "user" set email_verified = $1 where email = $2', [verified, email]);
}

export async function setOnlySocialAccount(email: string, providerId = "discord") {
  const pool = openPool();
  try {
    await pool.query(
      'update "account" set provider_id = $1, account_id = $2, password = null where user_id = (select id from "user" where email = $3) and provider_id = $4',
      [providerId, `${providerId}-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`, email, "credential"],
    );
  } finally {
    await closePool();
  }
}

export async function createAccount(
  page: Page,
  label: string,
  options: { verified?: boolean } = {},
) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.invalid`;
  const verified = options.verified ?? true;
  const rateLimitIp = `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;

  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": rateLimitIp });
  await clearRateLimits(rateLimitIp);
  await page.goto("/sign-up");
  await page.getByLabel("Nombre").fill(`E2E ${label}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contrase\u00f1a").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Cuenta creada")).toBeVisible({ timeout: 15_000 });

  await setEmailVerified(email, verified);
  if (verified) {
    await signIn(page, email, E2E_PASSWORD);
  }

  return { email, password: E2E_PASSWORD };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contrase\u00f1a").fill(password);
  await page.getByRole("button", { name: "Iniciar sesi\u00f3n" }).click();
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
    storeUrl?: string;
    discordUrl?: string;
    tags?: string[];
  },
) {
  await page.goto("/servers/new");
  await page.getByLabel("Nombre", { exact: true }).fill(options.name);
  if (options.description) await page.getByLabel("Descripción", { exact: true }).fill(options.description);
  if (options.websiteUrl) await page.getByLabel("Sitio web", { exact: true }).fill(options.websiteUrl);
  if (options.storeUrl) await page.getByLabel("Tienda del servidor", { exact: true }).fill(options.storeUrl);
  if (options.discordUrl) await page.getByLabel("Invitación de Discord", { exact: true }).fill(options.discordUrl);

  const javaHost = options.javaHost ?? `java-${Date.now()}.example.invalid`;
  await page.locator('input[name="host"]').fill(javaHost);
  if (options.javaPort !== undefined) await page.locator('input[name="javaPort"]').fill(String(options.javaPort));

  if (options.bedrockHost) {
    await page.getByRole("switch", { name: "Bedrock" }).click();
    await page.locator('input[name="bedrockHost"]').fill(options.bedrockHost);
    if (options.bedrockPort !== undefined) await page.locator('input[name="bedrockPort"]').fill(String(options.bedrockPort));
  }

  if (options.tags?.length) {
    const tagInput = page.getByRole("combobox", { name: "Etiquetas" });
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
  await pool.query(
    "update server_endpoints set verification_status = 'verified' where edition = any($1::minecraft_edition[]) and server_id = (select id from servers where slug = $2)",
    [editions, slug],
  );
  await pool.query(
    "update servers set verification_status = 'verified', verified_at = now() where slug = $1",
    [slug],
  );
}

export async function publishServer(page: Page, slug: string) {
  await page.goto(`/servers/${slug}/manage`);
  await page.locator("#publication-status").selectOption("published");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));
}

export async function setEndpointHealth(slug: string, edition: "java" | "bedrock", health: "online" | "offline") {
  const pool = openPool();
  await pool.query(
    "update server_endpoints set health_status = $1, last_checked_at = now(), verification_status = 'verified' where edition = $2 and server_id = (select id from servers where slug = $3)",
    [health, edition, slug],
  );
}

export async function grantPlatformRole(email: string, role: "moderator" | "admin") {
  const pool = openPool();
  await pool.query(
    "insert into platform_roles (user_id, role) select id, $1 from \"user\" where email = $2 on conflict (user_id) do update set role = excluded.role",
    [role, email],
  );
}

export async function getServerId(slug: string) {
  const pool = openPool();
  const result = await pool.query("select id from servers where slug = $1", [slug]);
  return result.rows[0]?.id as string | undefined;
}

export async function cleanupAccounts(emails: string[]) {
  if (!emails.length) return;
  const pool = openPool();
  await pool.query(
    'delete from servers where id in (select server_id from server_members where user_id in (select id from "user" where email = any($1::text[])))',
    [emails],
  );
  await pool.query(
    'delete from server_members where user_id in (select id from "user" where email = any($1::text[]))',
    [emails],
  );
  await pool.query('delete from "user" where email = any($1::text[])', [emails]);
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function makeAuthToken(payload: Record<string, string | number>) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256" }));
  const body = base64Url(JSON.stringify({ ...payload, iat: now, exp: now + 3600 }));
  const input = `${header}.${body}`;
  const signature = createHmac("sha256", E2E_AUTH_SECRET).update(input).digest("base64url");
  return `${input}.${signature}`;
}

export function makeEmailVerificationToken(email: string) {
  return makeAuthToken({ email: email.toLowerCase() });
}

export function makeEmailChangeToken(
  currentEmail: string,
  newEmail: string,
  requestType: "change-email-confirmation" | "change-email-verification",
) {
  return makeAuthToken({
    email: currentEmail.toLowerCase(),
    updateTo: newEmail.toLowerCase(),
    requestType,
  });
}

export async function requestPasswordReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/Si existe una cuenta/i)).toBeVisible();

  const pool = openPool();
  const result = await pool.query(
    `select verification.identifier
     from verification
     join "user" on "user".id = verification.value
     where "user".email = $1 and verification.identifier like 'reset-password:%'
     order by verification.created_at desc
     limit 1`,
    [email],
  );
  const identifier = result.rows[0]?.identifier as string | undefined;
  if (!identifier) throw new Error("The reset token was not created.");
  return identifier.replace("reset-password:", "");
}
