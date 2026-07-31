import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationEnabled = Boolean(testDatabaseUrl);
const configuredApplicationUrls = [
  process.env.DATABASE_URL,
  process.env.DIRECT_DATABASE_URL,
].filter((value): value is string => Boolean(value));

if (testDatabaseUrl && configuredApplicationUrls.includes(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must be a dedicated test database and cannot equal an application database URL.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({
      connectionString: testDatabaseUrl,
      max: 2,
      connectionTimeoutMillis: 5_000,
    })
  : null;

const createdServerIds = new Set<string>();
const createdUserIds = new Set<string>();
let serverServices: typeof import("../src/lib/servers/service.ts") | null = null;
let closeDatabase: (() => Promise<void>) | null = null;

const testOptions = { skip: !integrationEnabled };

function database() {
  if (!pool) throw new Error("TEST_DATABASE_URL is required for integration tests.");
  return pool;
}

async function loadServerServices() {
  if (!serverServices) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-that-is-at-least-32-characters";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    serverServices = await import("../src/lib/servers/service.ts");
    ({ closeDatabase } = await import("../src/db.ts"));
  }
  return serverServices;
}

function uniqueEmail() {
  return `${randomUUID()}@integration.invalid`;
}

function uniqueSlug() {
  return `integration-${randomUUID()}`;
}

async function createUser() {
  const id = `integration-user-${randomUUID()}`;
  await database().query(
    'insert into "user" (id, name, email, email_verified) values ($1, $2, $3, true)',
    [id, "Integration Test User", uniqueEmail()],
  );
  createdUserIds.add(id);
  return id;
}

async function createServerRecord({
  ownerId,
  endpoint,
}: {
  ownerId: string;
  endpoint?: { host: string; port: number; verificationStatus?: "unverified" | "verified" };
}) {
  const serverId = randomUUID();
  const client = await database().connect();

  try {
    await client.query("begin");
    await client.query(
      'insert into servers (id, name, slug) values ($1, $2, $3)',
      [serverId, `Integration ${serverId}`, uniqueSlug()],
    );
    await client.query(
      'insert into server_members (server_id, user_id, role) values ($1, $2, $3)',
      [serverId, ownerId, "owner"],
    );
    if (endpoint) {
      await client.query(
        'insert into server_endpoints (server_id, edition, host, port, verification_status) values ($1, $2, $3, $4, $5)',
        [serverId, "java", endpoint.host, endpoint.port, endpoint.verificationStatus ?? "unverified"],
      );
    }
    await client.query("commit");
    createdServerIds.add(serverId);
    return serverId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createVerification(serverId: string, status = "pending") {
  const verificationId = randomUUID();
  await database().query(
    `insert into server_verifications
      (id, server_id, endpoint_host, endpoint_port, token_hash, token_ciphertext, status, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + interval '30 minutes')`,
    [
      verificationId,
      serverId,
      "mc.example.invalid",
      25565,
      randomUUID().replaceAll("-", "").padEnd(64, "0"),
      Buffer.from("integration-test-token"),
      status,
    ],
  );
  return verificationId;
}

async function assertDatabaseShape() {
  const result = await database().query(
    "select to_regclass('public.servers') as servers, to_regclass('public.server_endpoints') as endpoints, to_regclass('public.server_verifications') as verifications",
  );
  assert.deepEqual(result.rows[0], {
    servers: "servers",
    endpoints: "server_endpoints",
    verifications: "server_verifications",
  });
}

before(async () => {
  if (!integrationEnabled) return;
  await assertDatabaseShape();
});

afterEach(async () => {
  if (!pool) return;
  const serverIds = [...createdServerIds];
  const userIds = [...createdUserIds];
  if (serverIds.length) {
    await pool.query("delete from servers where id = any($1::uuid[])", [serverIds]);
  }
  if (userIds.length) {
    await pool.query('delete from "user" where id = any($1::text[])', [userIds]);
  }
  createdServerIds.clear();
  createdUserIds.clear();
});

after(async () => {
  if (closeDatabase) await closeDatabase();
  if (pool) await pool.end();
});

test("server creation rolls back when the owner insert fails", testOptions, async () => {
  const { createServer } = await loadServerServices();
  const missingOwnerId = `missing-owner-${randomUUID()}`;
  const name = `Atomic ${randomUUID()}`;

  await assert.rejects(
    () =>
      createServer(missingOwnerId, {
        name,
        endpoints: [{ edition: "java", host: "atomic.example.invalid", port: 25565 }],
      }),
    (error: unknown) => (error as { code?: string; name?: string }).code === "23503" || (error as { name?: string }).name === "UnverifiedEmailError",
  );

  const result = await database().query("select count(*)::int as count from servers where name = $1", [name]);
  assert.equal(result.rows[0].count, 0);
});

test("a verified endpoint cannot be claimed by a second server", testOptions, async () => {
  const ownerOne = await createUser();
  const ownerTwo = await createUser();
  const endpoint = { host: "verified-endpoint.example.invalid", port: 25565, verificationStatus: "verified" as const };
  await createServerRecord({ ownerId: ownerOne, endpoint });

  await assert.rejects(
    () => createServerRecord({ ownerId: ownerTwo, endpoint }),
    (error: unknown) => (error as { code?: string }).code === "23505",
  );
});

test("a server cannot have a second owner", testOptions, async () => {
  const ownerOne = await createUser();
  const ownerTwo = await createUser();
  const serverId = await createServerRecord({ ownerId: ownerOne });

  await assert.rejects(
    () => database().query(
      "insert into server_members (server_id, user_id, role) values ($1, $2, $3)",
      [serverId, ownerTwo, "owner"],
    ),
    (error: unknown) => (error as { code?: string }).code === "23505",
  );
});

test("the deferred owner invariant blocks deleting the last owner", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({ ownerId });
  const client = await database().connect();

  try {
    await client.query("begin");
    await client.query("delete from server_members where server_id = $1 and user_id = $2", [serverId, ownerId]);
    await assert.rejects(
      () => client.query("commit"),
      (error: unknown) => (error as { code?: string }).code === "23514",
    );
    await client.query("rollback");
  } finally {
    client.release();
  }
});

test("a server can have only one pending verification", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({ ownerId });
  await createVerification(serverId);

  await assert.rejects(
    () => createVerification(serverId),
    (error: unknown) => (error as { code?: string }).code === "23505",
  );
});

test("an already verified endpoint cannot generate another MOTD code", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({
    ownerId,
    endpoint: { host: "already-verified.example.invalid", port: 25565, verificationStatus: "verified" },
  });
  const { startServerVerification, EndpointAlreadyVerifiedError } = await import("../src/lib/servers/verification.ts");

  await assert.rejects(
    () => startServerVerification(serverId, ownerId, "java"),
    (error: unknown) => error instanceof EndpointAlreadyVerifiedError,
  );
});

test("an unchanged endpoint keeps one pending MOTD code", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({
    ownerId,
    endpoint: { host: "pending-code.example.invalid", port: 25565 },
  });
  const { startServerVerification, VerificationAlreadyPendingError } = await import("../src/lib/servers/verification.ts");

  await startServerVerification(serverId, ownerId, "java");
  await assert.rejects(
    () => startServerVerification(serverId, ownerId, "java"),
    (error: unknown) => error instanceof VerificationAlreadyPendingError,
  );
});

test("changing the Java endpoint invalidates verification", testOptions, async () => {
  const ownerId = await createUser();
  const { createServer, updateServer } = await loadServerServices();
  const created = await createServer(ownerId, {
    name: `Invalidate ${randomUUID()}`,
    endpoints: [{ edition: "java", host: "old-endpoint.example.invalid", port: 25565 }],
  });
  const server = await database().query("select id from servers where slug = $1", [created.slug]);
  const serverId = server.rows[0].id as string;
  createdServerIds.add(serverId);
  await database().query(
    "update servers set verification_status = 'verified', verified_at = now() where id = $1",
    [serverId],
  );
  await database().query(
    "update server_endpoints set verification_status = 'verified' where server_id = $1 and edition = 'java'",
    [serverId],
  );
  await createVerification(serverId);

  await updateServer(ownerId, serverId, {
    name: `Invalidate ${randomUUID()}`,
    endpoints: [{ edition: "java", host: "new-endpoint.example.invalid", port: 25565 }],
  });

  const result = await database().query(
    `select servers.verification_status as server_status,
            server_endpoints.verification_status as endpoint_status,
            server_verifications.status as verification_status
     from servers
     join server_endpoints on server_endpoints.server_id = servers.id
     join server_verifications on server_verifications.server_id = servers.id
     where servers.id = $1`,
    [serverId],
  );
  assert.deepEqual(result.rows[0], {
    server_status: "unverified",
    endpoint_status: "unverified",
    verification_status: "superseded",
  });
});

test("permissions are revalidated inside the update transaction", testOptions, async () => {
  const ownerId = await createUser();
  const outsiderId = await createUser();
  const { createServer, updateServer } = await loadServerServices();
  const { ServerPermissionError } = await import("../src/lib/servers/permissions.ts");
  const created = await createServer(ownerId, {
    name: `Permission ${randomUUID()}`,
    endpoints: [{ edition: "java", host: "permission.example.invalid", port: 25565 }],
  });
  const server = await database().query("select id, name from servers where slug = $1", [created.slug]);
  const serverId = server.rows[0].id as string;
  createdServerIds.add(serverId);

  await assert.rejects(
    () =>
      updateServer(outsiderId, serverId, {
        name: "Unauthorized update",
        endpoints: [{ edition: "java", host: "permission.example.invalid", port: 25565 }],
      }),
    ServerPermissionError,
  );

  const unchanged = await database().query("select name from servers where id = $1", [serverId]);
  assert.equal(unchanged.rows[0].name, server.rows[0].name);
});
