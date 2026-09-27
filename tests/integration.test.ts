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

// The env schema is parsed on first import, so every secret a test needs is set before anything loads.
process.env.VOTIFIER_SECRET ??= "integration-votifier-secret-at-least-32-characters";

const createdServerIds = new Set<string>();
const createdUserIds = new Set<string>();
let serverServices: typeof import("../src/lib/servers/service.ts") | null = null;
let reviewServices: typeof import("../src/lib/servers/reviews.ts") | null = null;
let adminServices: typeof import("../src/lib/admin.ts") | null = null;
let voteServices: typeof import("../src/lib/votes/service.ts") | null = null;
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

async function loadReviewServices() {
  if (!reviewServices) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-that-is-at-least-32-characters";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    reviewServices = await import("../src/lib/servers/reviews.ts");
    ({ closeDatabase } = await import("../src/db.ts"));
  }
  return reviewServices;
}

async function loadVoteServices() {
  if (!voteServices) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-that-is-at-least-32-characters";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    voteServices = await import("../src/lib/votes/service.ts");
    ({ closeDatabase } = await import("../src/db.ts"));
  }
  return voteServices;
}

async function loadAdminServices() {
  if (!adminServices) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-that-is-at-least-32-characters";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    adminServices = await import("../src/lib/admin.ts");
    ({ closeDatabase } = await import("../src/db.ts"));
  }
  return adminServices;
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

async function publishServer(serverId: string) {
  await database().query(
    "update servers set publication_status = 'published', verification_status = 'verified', verified_at = now() where id = $1",
    [serverId],
  );
  await database().query(
    "update server_endpoints set verification_status = 'verified' where server_id = $1",
    [serverId],
  );
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
        gameModes: ["survival"],
        country: "es",
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
    gameModes: ["survival"],
    country: "es",
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
    gameModes: ["survival"],
    country: "es",
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

test("a published server can move to a new host", testOptions, async () => {
  const ownerId = await createUser();
  const { createServer, updateServer } = await loadServerServices();
  const name = `Relocate ${randomUUID()}`;
  const created = await createServer(ownerId, {
    name,
    gameModes: ["survival"],
    country: "es",
    host: `old-${randomUUID()}.example.invalid`,
    javaPort: 25565,
  });
  const server = await database().query("select id from servers where slug = $1", [created.slug]);
  const serverId = server.rows[0].id as string;
  createdServerIds.add(serverId);
  await publishServer(serverId);

  const nextHost = `new-${randomUUID()}.example.invalid`;
  // The manage form resubmits the current publication state on every save, so the move has to
  // survive the publish guard instead of rolling the whole edit back.
  await updateServer(ownerId, serverId, { name, gameModes: ["survival"], country: "es", host: nextHost, javaPort: 25565 }, "published");

  const result = await database().query(
    `select servers.publication_status, servers.verification_status, server_endpoints.host, server_network_targets.host as target_host
     from servers
     join server_endpoints on server_endpoints.server_id = servers.id
     join server_network_targets on server_network_targets.server_id = servers.id
     where servers.id = $1`,
    [serverId],
  );
  assert.deepEqual(result.rows[0], {
    publication_status: "published",
    verification_status: "unverified",
    host: nextHost,
    target_host: nextHost,
  });
});

test("renaming a server moves its slug and keeps what hangs off its id", testOptions, async () => {
  const ownerId = await createUser();
  const reviewerId = await createUser();
  const { createServer, updateServer } = await loadServerServices();
  const suffix = randomUUID().slice(0, 8);
  const host = `rename-${randomUUID()}.example.invalid`;
  const created = await createServer(ownerId, { name: `Ferreras SMP ${suffix}`, gameModes: ["survival"], country: "es", host, javaPort: 25565 });
  const server = await database().query("select id from servers where slug = $1", [created.slug]);
  const serverId = server.rows[0].id as string;
  createdServerIds.add(serverId);
  await database().query(
    "insert into server_reviews (server_id, user_id, rating, content) values ($1, $2, 5, 'Buen servidor para jugar con amigos.')",
    [serverId, reviewerId],
  );

  // Another server already holds the plain slug, so the rename has to take the next free one.
  const blocker = await createServer(ownerId, { name: `Cubusfera ${suffix}`, gameModes: ["survival"], country: "es", host: `blocker-${randomUUID()}.example.invalid`, javaPort: 25565 });
  const blockerRow = await database().query("select id from servers where slug = $1", [blocker.slug]);
  createdServerIds.add(blockerRow.rows[0].id as string);

  const renamed = await updateServer(ownerId, serverId, { name: `Cubusfera ${suffix}`, gameModes: ["survival"], country: "es", host, javaPort: 25565 });
  assert.equal(renamed.previousSlug, created.slug);
  assert.equal(renamed.slug, `cubusfera-${suffix}-2`);

  // A rename that only touches casing keeps the address it already has.
  const recased = await updateServer(ownerId, serverId, { name: `CUBUSFERA ${suffix}`, gameModes: ["survival"], country: "es", host, javaPort: 25565 });
  assert.equal(recased.slug, `cubusfera-${suffix}-2`);

  const reviews = await database().query("select count(*)::int as count from server_reviews where server_id = $1", [serverId]);
  assert.equal(reviews.rows[0].count, 1);
});

test("publishing still requires a verified endpoint", testOptions, async () => {
  const ownerId = await createUser();
  const { createServer, updateServer, NoVerifiedEndpointError } = await loadServerServices();
  const name = `Unverified ${randomUUID()}`;
  const created = await createServer(ownerId, {
    name,
    gameModes: ["survival"],
    country: "es",
    host: `unverified-${randomUUID()}.example.invalid`,
    javaPort: 25565,
  });
  const server = await database().query("select id from servers where slug = $1", [created.slug]);
  const serverId = server.rows[0].id as string;
  createdServerIds.add(serverId);

  await assert.rejects(
    () => updateServer(ownerId, serverId, { name, gameModes: ["survival"], country: "es", host: `unverified-${randomUUID()}.example.invalid`, javaPort: 25565 }, "published"),
    NoVerifiedEndpointError,
  );

  const result = await database().query("select publication_status from servers where id = $1", [serverId]);
  assert.equal(result.rows[0].publication_status, "draft");
});

test("an existing server cannot be saved without a game mode or a country", testOptions, async () => {
  const ownerId = await createUser();
  const { createServer, updateServer } = await loadServerServices();
  const name = `Required ${randomUUID()}`;
  const host = `required-${randomUUID()}.example.invalid`;
  const created = await createServer(ownerId, { name, gameModes: ["survival"], country: "es", host, javaPort: 25565 });
  const server = await database().query("select id from servers where slug = $1", [created.slug]);
  const serverId = server.rows[0].id as string;
  createdServerIds.add(serverId);

  const { ServerInputError } = await import("../src/lib/servers/validation.ts");
  const cases = [
    { field: "gameModes", input: { name, gameModes: [], country: "es", host, javaPort: 25565 } },
    { field: "country", input: { name, gameModes: ["survival"], country: undefined, host, javaPort: 25565 } },
  ];
  for (const { field, input } of cases) {
    await assert.rejects(
      () => updateServer(ownerId, serverId, input),
      (error: unknown) => error instanceof ServerInputError && error.field === field,
    );
  }

  // The rejection has to leave the stored modes alone rather than blanking them on the way out.
  const stored = await database().query("select mode from server_game_modes where server_id = $1", [serverId]);
  assert.deepEqual(stored.rows.map((row) => row.mode), ["survival"]);
});

test("permissions are revalidated inside the update transaction", testOptions, async () => {
  const ownerId = await createUser();
  const outsiderId = await createUser();
  const { createServer, updateServer } = await loadServerServices();
  const { ServerPermissionError } = await import("../src/lib/servers/permissions.ts");
  const created = await createServer(ownerId, {
    name: `Permission ${randomUUID()}`,
    gameModes: ["survival"],
    country: "es",
    endpoints: [{ edition: "java", host: "permission.example.invalid", port: 25565 }],
  });
  const server = await database().query("select id, name from servers where slug = $1", [created.slug]);
  const serverId = server.rows[0].id as string;
  createdServerIds.add(serverId);

  await assert.rejects(
    () =>
      updateServer(outsiderId, serverId, {
        name: "Unauthorized update",
        gameModes: ["survival"],
        country: "es",
        endpoints: [{ edition: "java", host: "permission.example.invalid", port: 25565 }],
      }),
    ServerPermissionError,
  );

  const unchanged = await database().query("select name from servers where id = $1", [serverId]);
  assert.equal(unchanged.rows[0].name, server.rows[0].name);
});

test("reviews create, aggregate, edit, hide, restore and delete safely", testOptions, async () => {
  const ownerId = await createUser();
  const reviewerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `reviews-${randomUUID()}.example.invalid`, port: 25565 } });
  await publishServer(serverId);
  const { createReview, updateReview, deleteReview, getReviewSummary, ReviewStateError } = await loadReviewServices();

  const created = await createReview(reviewerId, serverId, { rating: 5, content: "  Una comunidad excelente  " });
  assert.ok(created?.id);
  let summary = await getReviewSummary(serverId);
  assert.deepEqual(summary.distribution, [0, 0, 0, 0, 1]);
  assert.equal(summary.total, 1);
  assert.equal(summary.average, 5);

  await updateReview(reviewerId, created!.id, { rating: 3, content: "Experiencia correcta y estable" });
  summary = await getReviewSummary(serverId);
  assert.deepEqual(summary.distribution, [0, 0, 1, 0, 0]);
  assert.equal(summary.average, 3);

  await database().query("update server_reviews set status = 'hidden' where id = $1", [created!.id]);
  summary = await getReviewSummary(serverId);
  assert.equal(summary.total, 0);
  await database().query("update server_reviews set status = 'published' where id = $1", [created!.id]);
  summary = await getReviewSummary(serverId);
  assert.equal(summary.total, 1);

  await deleteReview(reviewerId, created!.id);
  summary = await getReviewSummary(serverId);
  assert.equal(summary.total, 0);
  const recreated = await createReview(reviewerId, serverId, { rating: 4, content: "Una nueva opinión tras borrar" });
  assert.ok(recreated?.id);
  assert.notEqual(recreated?.id, created?.id);
  await assert.rejects(() => updateReview(reviewerId, created!.id, { rating: 4, content: "No debería editarse" }), ReviewStateError);
});

test("adding a player to the server team withholds their review without destroying it", testOptions, async () => {
  const ownerId = await createUser();
  const reviewerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `member-review-${randomUUID()}.example.invalid`, port: 25565 } });
  await publishServer(serverId);
  const { createReview, getReviewSummary } = await loadReviewServices();
  const { rows: reviewerRows } = await database().query('select email from "user" where id = $1', [reviewerId]);

  const review = await createReview(reviewerId, serverId, { rating: 5, content: "Una comunidad excelente" });
  const { addServerMember, removeServerMember } = await import("../src/lib/servers/members.ts");
  await addServerMember(serverId, ownerId, reviewerRows[0].email, "editor");

  assert.equal((await getReviewSummary(serverId)).total, 0);
  const withheld = await database().query("select status, content, withheld_at from server_reviews where id = $1", [review?.id]);
  assert.equal(withheld.rows[0].status, "published");
  assert.equal(withheld.rows[0].content, "Una comunidad excelente");
  assert.ok(withheld.rows[0].withheld_at);

  // The reviewer never accepted the membership, so the change must be reversible.
  await removeServerMember(serverId, ownerId, reviewerId);
  assert.equal((await getReviewSummary(serverId)).total, 1);
  const restored = await database().query("select content, withheld_at from server_reviews where id = $1", [review?.id]);
  assert.equal(restored.rows[0].withheld_at, null);
  assert.equal(restored.rows[0].content, "Una comunidad excelente");
});

test("a server admin cannot delete the server while the owner can", testOptions, async () => {
  const ownerId = await createUser();
  const adminId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `admin-delete-${randomUUID()}.example.invalid`, port: 25565 } });
  await database().query(
    "insert into server_members (server_id, user_id, role) values ($1, $2, 'admin')",
    [serverId, adminId],
  );
  const { deleteServer } = await loadServerServices();
  const { ServerPermissionError } = await import("../src/lib/servers/permissions.ts");

  await assert.rejects(() => deleteServer(adminId, serverId, "DELETE"), ServerPermissionError);
  const survived = await database().query("select id from servers where id = $1", [serverId]);
  assert.equal(survived.rowCount, 1);

  await deleteServer(ownerId, serverId, "DELETE");
  const removed = await database().query("select id from servers where id = $1", [serverId]);
  assert.equal(removed.rowCount, 0);
});

test("deleting a server never refunds media bytes that were already released", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `media-refund-${randomUUID()}.example.invalid`, port: 25565 } });
  await database().query(
    `insert into server_media (server_id, kind, blob_key, blob_url, content_type, bytes, width, height, status)
     values ($1, 'logo', $2, 'https://blob.invalid/a', 'image/webp', 1000, 64, 64, 'deleted'),
            ($1, 'banner', $3, 'https://blob.invalid/b', 'image/webp', 500, 128, 64, 'active')`,
    [serverId, `key-${randomUUID()}`, `key-${randomUUID()}`],
  );
  await database().query(
    "insert into media_usage_counters (period, stored_bytes) values ('total', 500) on conflict (period) do update set stored_bytes = 500",
  );

  const { deleteServer } = await loadServerServices();
  await deleteServer(ownerId, serverId, "DELETE");

  const counter = await database().query("select stored_bytes from media_usage_counters where period = 'total'");
  assert.equal(Number(counter.rows[0].stored_bytes), 0);
});

test("one account cannot exhaust the shared monthly upload budget", testOptions, async () => {
  const firstUserId = await createUser();
  const secondUserId = await createUser();
  process.env.DATABASE_URL = testDatabaseUrl;
  const { MediaAccountQuotaExceededError, reserveAccountMediaOperation } = await import("../src/lib/media/quota.ts");

  const outcomes = await Promise.allSettled(
    Array.from({ length: 14 }, () => reserveAccountMediaOperation(firstUserId)),
  );
  const accepted = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
  const refused = outcomes.filter(
    (outcome) => outcome.status === "rejected" && outcome.reason instanceof MediaAccountQuotaExceededError,
  ).length;

  assert.ok(accepted <= 10, `expected at most 10 accepted uploads, got ${accepted}`);
  assert.equal(accepted + refused, 14);

  // A refused upload must not spend budget, or repeated 429s would lock the
  // account out of its own monthly allowance.
  const { rows } = await database().query(
    "select advanced_operations, window_operations from media_account_usage where user_id = $1",
    [firstUserId],
  );
  assert.equal(Number(rows[0].advanced_operations), accepted);
  assert.equal(Number(rows[0].window_operations), accepted);

  // A throttled account must never block anybody else.
  await reserveAccountMediaOperation(secondUserId);
});

test("failed uploads still spend the account's share of the shared budget", testOptions, async () => {
  const userId = await createUser();
  process.env.DATABASE_URL = testDatabaseUrl;
  const { MediaAccountQuotaExceededError, reserveAccountMediaOperation } = await import("../src/lib/media/quota.ts");

  // Every attempt fails after its reservation, the way an upload does when the
  // blob lands but the transaction loses the one-active-kind race. The shared
  // operation counter stays charged for those, so the account slice must too:
  // if failures were refunded, an account could drain the shared monthly budget
  // forever while never reaching its own cap.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await reserveAccountMediaOperation(userId);
    // ... the upload fails here; nothing gives the slot back.
  }

  await assert.rejects(() => reserveAccountMediaOperation(userId), MediaAccountQuotaExceededError);
  const { rows } = await database().query(
    "select advanced_operations, window_operations from media_account_usage where user_id = $1",
    [userId],
  );
  assert.equal(Number(rows[0].advanced_operations), 10);
  assert.equal(Number(rows[0].window_operations), 10);
});

test("moderating a report reports the server whose public cache must be dropped", testOptions, async () => {
  const ownerId = await createUser();
  const reporterId = await createUser();
  const moderatorId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `moderation-cache-${randomUUID()}.example.invalid`, port: 25565 } });
  await publishServer(serverId);
  const reportId = randomUUID();
  await database().query(
    "insert into server_reports (id, server_id, reporter_user_id, reason, status) values ($1, $2, $3, 'other', 'open')",
    [reportId, serverId, reporterId],
  );
  await database().query("insert into platform_roles (user_id, role) values ($1, 'moderator')", [moderatorId]);

  const { moderateReport } = await loadAdminServices();
  const transitioned = await moderateReport(moderatorId, reportId, "hidden");

  const { rows } = await database().query("select slug, moderation_status from servers where id = $1", [serverId]);
  assert.equal(rows[0].moderation_status, "blocked");
  assert.deepEqual(transitioned, { serverId, slug: rows[0].slug });
});

test("public player history stays private for a server that is not publicly visible", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `private-history-${randomUUID()}.example.invalid`, port: 25565 } });
  process.env.DATABASE_URL = testDatabaseUrl;
  const previousUrl = process.env.MONITOR_API_URL;
  const previousSecret = process.env.MONITOR_API_SECRET;
  const originalFetch = globalThis.fetch;
  let monitorCalls = 0;
  process.env.MONITOR_API_URL = "https://monitor-api.example.test";
  process.env.MONITOR_API_SECRET = "integration-monitor-secret";
  globalThis.fetch = (async () => {
    monitorCalls += 1;
    return Response.json({ period: "24h", series: [] });
  }) as typeof fetch;

  try {
    const { getPublicPlayerHistory } = await import("../src/lib/servers/player-history.ts");
    // Draft server: the Monitor API must never be asked for its history.
    assert.equal(await getPublicPlayerHistory(serverId, "24h"), null);
    assert.equal(monitorCalls, 0);

    await publishServer(serverId);
    assert.ok(await getPublicPlayerHistory(serverId, "24h"));
    assert.equal(monitorCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.MONITOR_API_URL;
    else process.env.MONITOR_API_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.MONITOR_API_SECRET;
    else process.env.MONITOR_API_SECRET = previousSecret;
  }
});

test("a draft's members read its player history from the Monitor API and strangers do not", testOptions, async () => {
  const ownerId = await createUser();
  const strangerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `draft-history-${randomUUID()}.example.invalid`, port: 25565 } });
  process.env.DATABASE_URL = testDatabaseUrl;
  const previousUrl = process.env.MONITOR_API_URL;
  const previousSecret = process.env.MONITOR_API_SECRET;
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  process.env.MONITOR_API_URL = "https://monitor-api.example.test";
  process.env.MONITOR_API_SECRET = "integration-monitor-secret";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return Response.json({ period: "24h", series: [] });
  }) as typeof fetch;

  try {
    const { getManagedPlayerHistory } = await import("../src/lib/servers/player-history.ts");
    // Neon receives no samples once the Monitor API is configured, so the
    // owner's view of a fresh draft must come from the Monitor API, not a 404.
    assert.deepEqual(await getManagedPlayerHistory(serverId, ownerId, "24h"), { period: "24h", series: [] });
    assert.equal(await getManagedPlayerHistory(serverId, strangerId, "24h"), null);
    assert.deepEqual(requestedUrls, [`https://monitor-api.example.test/v1/servers/${serverId}/history?period=24h`]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.MONITOR_API_URL;
    else process.env.MONITOR_API_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.MONITOR_API_SECRET;
    else process.env.MONITOR_API_SECRET = previousSecret;
  }
});

test("reconciliation never deletes monitor targets from a truncated inventory", testOptions, async () => {
  const ownerId = await createUser();
  await createServerRecord({ ownerId, endpoint: { host: `reconcile-a-${randomUUID()}.example.invalid`, port: 25565 } });
  await createServerRecord({ ownerId, endpoint: { host: `reconcile-b-${randomUUID()}.example.invalid`, port: 25565 } });
  process.env.DATABASE_URL = testDatabaseUrl;
  const previousUrl = process.env.MONITOR_API_URL;
  const previousSecret = process.env.MONITOR_API_SECRET;
  const originalFetch = globalThis.fetch;
  const deletions: string[] = [];
  process.env.MONITOR_API_URL = "https://monitor-api.example.test";
  process.env.MONITOR_API_SECRET = "integration-monitor-secret";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "DELETE") deletions.push(url);
    if (url.endsWith("/v1/targets")) return Response.json({ serverIds: [randomUUID()] });
    return Response.json({ ok: true });
  }) as typeof fetch;

  try {
    const { reconcileMonitorTargets } = await import("../src/lib/servers/monitor-sync.ts");
    const result = await reconcileMonitorTargets({ pageSize: 1, maxPages: 1 });
    assert.equal(result.complete, false);
    assert.equal(result.removed, 0);
    assert.deepEqual(deletions, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.MONITOR_API_URL;
    else process.env.MONITOR_API_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.MONITOR_API_SECRET;
    else process.env.MONITOR_API_SECRET = previousSecret;
  }
});

test("the unique review constraint wins a concurrent duplicate", testOptions, async () => {
  const ownerId = await createUser();
  const reviewerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `race-${randomUUID()}.example.invalid`, port: 25565 } });
  await publishServer(serverId);
  const { createReview, ReviewAlreadyExistsError } = await loadReviewServices();

  const results = await Promise.allSettled([
    createReview(reviewerId, serverId, { rating: 4, content: "Primera opinión válida" }),
    createReview(reviewerId, serverId, { rating: 5, content: "Segunda opinión inválida" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason instanceof ReviewAlreadyExistsError).length, 1);
});

test("only one official reply is allowed and editors cannot create it", testOptions, async () => {
  const ownerId = await createUser();
  const adminId = await createUser();
  const editorId = await createUser();
  const reviewerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `replies-${randomUUID()}.example.invalid`, port: 25565 } });
  await publishServer(serverId);
  await database().query("insert into server_members (server_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'editor')", [serverId, adminId, editorId]);
  const { createReview, createOfficialReply, OfficialReplyAlreadyExistsError, OfficialReplyPermissionError } = await loadReviewServices();
  const review = await createReview(reviewerId, serverId, { rating: 4, content: "Buen servidor para jugar" });
  await createOfficialReply(adminId, review!.id, "Gracias por compartir tu experiencia");
  await assert.rejects(() => createOfficialReply(adminId, review!.id, "Otra respuesta oficial"), OfficialReplyAlreadyExistsError);
  await assert.rejects(() => createOfficialReply(editorId, review!.id, "No debería responder"), OfficialReplyPermissionError);
});

test("review reports reject self reports and open duplicates", testOptions, async () => {
  const ownerId = await createUser();
  const reviewerId = await createUser();
  const reporterId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `reports-${randomUUID()}.example.invalid`, port: 25565 } });
  await publishServer(serverId);
  const { createReview, createReviewReport, ReviewReportAlreadyOpenError, ReviewReportSelfError } = await loadReviewServices();
  const review = await createReview(reviewerId, serverId, { rating: 2, content: "No me ha convencido la experiencia" });

  await assert.rejects(() => createReviewReport(reviewerId, serverId, review!.id, { reason: "other" }), ReviewReportSelfError);
  await createReviewReport(reporterId, serverId, review!.id, { reason: "offensive", details: "Detalle del reporte" });
  await assert.rejects(() => createReviewReport(reporterId, serverId, review!.id, { reason: "offensive" }), ReviewReportAlreadyOpenError);
});

test("reopening a dismissed server report rejects a newer open report from the same reporter", testOptions, async () => {
  const ownerId = await createUser();
  const reporterId = await createUser();
  const moderatorId = await createUser();
  const serverId = await createServerRecord({ ownerId });
  const dismissedReportId = randomUUID();
  const openReportId = randomUUID();
  const dismissedAt = new Date("2026-08-18T10:00:00.000Z");
  const openAt = new Date("2026-08-19T10:00:00.000Z");

  await database().query(
    `insert into server_reports
      (id, server_id, reporter_user_id, reason, status, created_at, updated_at)
     values ($1, $2, $3, 'other', 'dismissed', $4, $4),
            ($5, $2, $3, 'other', 'open', $6, $6)`,
    [dismissedReportId, serverId, reporterId, dismissedAt, openReportId, openAt],
  );
  await database().query(
    `insert into moderation_events
      (server_id, report_id, actor_user_id, action, created_at)
     values ($1, $2, $3, 'dismissed', $4),
            ($1, $5, $3, 'report_created', $6)`,
    [serverId, dismissedReportId, moderatorId, dismissedAt, openReportId, openAt],
  );
  await database().query(
    "insert into platform_roles (user_id, role) values ($1, 'moderator')",
    [moderatorId],
  );

  const { moderateReport } = await loadAdminServices();
  const { ReportAlreadyOpenError } = await import("../src/lib/servers/reports.ts");

  await assert.rejects(
    () => moderateReport(moderatorId, dismissedReportId, "reopened"),
    ReportAlreadyOpenError,
  );
  const result = await database().query("select status from server_reports where id = $1", [dismissedReportId]);
  assert.equal(result.rows[0].status, "dismissed");
});

test("restoring one server report keeps the server blocked when another report is still hidden", testOptions, async () => {
  const ownerId = await createUser();
  const firstReporterId = await createUser();
  const secondReporterId = await createUser();
  const moderatorId = await createUser();
  const serverId = await createServerRecord({ ownerId });
  const restoredReportId = randomUUID();
  const hiddenReportId = randomUUID();
  const hiddenAt = new Date("2026-08-19T10:00:00.000Z");

  await database().query("update servers set moderation_status = 'blocked' where id = $1", [serverId]);
  await database().query(
    `insert into server_reports
      (id, server_id, reporter_user_id, reason, status)
     values ($1, $3, $4, 'other', 'actioned'),
            ($2, $3, $5, 'other', 'actioned')`,
    [restoredReportId, hiddenReportId, serverId, firstReporterId, secondReporterId],
  );
  await database().query(
    `insert into moderation_events
      (server_id, report_id, actor_user_id, action, created_at)
     values ($1, $2, $4, 'hidden', $3),
            ($1, $5, $4, 'hidden', $3)`,
    [serverId, restoredReportId, hiddenAt, moderatorId, hiddenReportId],
  );
  await database().query(
    "insert into platform_roles (user_id, role) values ($1, 'moderator')",
    [moderatorId],
  );

  const { moderateReport } = await loadAdminServices();

  await moderateReport(moderatorId, restoredReportId, "restored");
  const result = await database().query("select moderation_status from servers where id = $1", [serverId]);
  assert.equal(result.rows[0].moderation_status, "blocked");
});

test("reopening a dismissed review report rejects a newer open report from the same reporter", testOptions, async () => {
  const ownerId = await createUser();
  const reviewerId = await createUser();
  const reporterId = await createUser();
  const moderatorId = await createUser();
  const serverId = await createServerRecord({ ownerId });
  await publishServer(serverId);
  const { createReview, ReviewReportAlreadyOpenError } = await loadReviewServices();
  const review = await createReview(reviewerId, serverId, { rating: 3, content: "Una opinión suficientemente larga" });
  const dismissedReportId = randomUUID();
  const openReportId = randomUUID();
  const dismissedAt = new Date("2026-08-18T10:00:00.000Z");
  const openAt = new Date("2026-08-19T10:00:00.000Z");

  await database().query(
    `insert into server_review_reports
      (id, server_id, review_id, reporter_user_id, reason, status, created_at, updated_at)
     values ($1, $2, $3, $4, 'other', 'dismissed', $5, $5),
            ($6, $2, $3, $4, 'other', 'open', $7, $7)`,
    [dismissedReportId, serverId, review!.id, reporterId, dismissedAt, openReportId, openAt],
  );
  await database().query(
    `insert into moderation_events
      (server_id, review_id, review_report_id, actor_user_id, action, created_at)
     values ($1, $2, $3, $4, 'dismissed', $5),
            ($1, $2, $6, $4, 'report_created', $7)`,
    [serverId, review!.id, dismissedReportId, moderatorId, dismissedAt, openReportId, openAt],
  );
  await database().query(
    "insert into platform_roles (user_id, role) values ($1, 'moderator')",
    [moderatorId],
  );

  const { moderateReviewReport } = await loadAdminServices();

  await assert.rejects(
    () => moderateReviewReport(moderatorId, dismissedReportId, "reopened"),
    ReviewReportAlreadyOpenError,
  );
  const result = await database().query("select status from server_review_reports where id = $1", [dismissedReportId]);
  assert.equal(result.rows[0].status, "dismissed");
});

async function createRankedServer() {
  const ownerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `votes-${randomUUID()}.example.invalid`, port: 25565 } });
  await publishServer(serverId);
  return serverId;
}

test("a vote is refused inside 23 hours by nickname, IP or account, and only on that server", testOptions, async () => {
  const serverId = await createRankedServer();
  const otherServerId = await createRankedServer();
  const voterId = await createUser();
  const { castVote } = await loadVoteServices();
  const now = new Date("2026-09-15T10:00:00Z");

  const first = await castVote({ serverId, nickname: "Kiroo_", nicknameKey: "kiroo_", ip: "203.0.113.10", userId: voterId, now });
  assert.equal(first.status, "ok");
  assert.equal(first.status === "ok" && first.votes, 1);
  assert.equal(first.status === "ok" && first.delivery, "not_configured");
  assert.equal(first.status === "ok" && first.linkedToAccount, true);

  const sameNickDifferentCase = await castVote({ serverId, nickname: "KIROO_", nicknameKey: "kiroo_", ip: "198.51.100.1", now: new Date(now.getTime() + 60_000) });
  assert.equal(sameNickDifferentCase.status, "cooldown");
  const sameIp = await castVote({ serverId, nickname: "Otro_nick", nicknameKey: "otro_nick", ip: "203.0.113.10", now: new Date(now.getTime() + 60_000) });
  assert.equal(sameIp.status, "cooldown");
  const sameAccount = await castVote({ serverId, nickname: "Tercero", nicknameKey: "tercero", ip: "198.51.100.2", userId: voterId, now: new Date(now.getTime() + 60_000) });
  assert.equal(sameAccount.status, "cooldown");
  assert.equal(sameAccount.status === "cooldown" && sameAccount.nextVoteAt.toISOString(), "2026-09-16T09:00:00.000Z");

  const elsewhere = await castVote({ serverId: otherServerId, nickname: "Kiroo_", nicknameKey: "kiroo_", ip: "203.0.113.10", userId: voterId, now: new Date(now.getTime() + 60_000) });
  assert.equal(elsewhere.status, "ok");

  const nextDay = await castVote({ serverId, nickname: "Kiroo_", nicknameKey: "kiroo_", ip: "203.0.113.10", userId: voterId, now: new Date(now.getTime() + 23 * 60 * 60 * 1000) });
  assert.equal(nextDay.status, "ok");
  assert.equal(nextDay.status === "ok" && nextDay.votes, 2);

  const stored = await database().query("select month, ip_hash from server_votes where server_id = $1", [serverId]);
  assert.deepEqual(stored.rows.map((row) => row.month), ["2026-09", "2026-09"]);
  assert.ok(stored.rows.every((row) => /^[0-9a-f]{64}$/.test(row.ip_hash) && !row.ip_hash.includes("203")));
});

test("two simultaneous votes from the same player count once", testOptions, async () => {
  const serverId = await createRankedServer();
  const { castVote } = await loadVoteServices();
  const now = new Date("2026-09-15T10:00:00Z");
  const results = await Promise.all([1, 2, 3].map(() => castVote({ serverId, nickname: "Rapido", nicknameKey: "rapido", ip: "203.0.113.20", now })));
  assert.equal(results.filter((result) => result.status === "ok").length, 1);
  const total = await database().query("select votes from server_monthly_votes where server_id = $1 and month = '2026-09'", [serverId]);
  assert.equal(total.rows[0].votes, 1);
});

test("unpublished servers cannot be voted for", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({ ownerId, endpoint: { host: `draft-${randomUUID()}.example.invalid`, port: 25565 } });
  const { castVote } = await loadVoteServices();
  const result = await castVote({ serverId, nickname: "Nadie", nicknameKey: "nadie", ip: "203.0.113.30" });
  assert.equal(result.status, "not-eligible");
});

test("the ranking puts more votes first and the stats agree with it", testOptions, async () => {
  const leaderId = await createRankedServer();
  const followerId = await createRankedServer();
  const { castVote, getRankPosition, getServerVoteStats } = await loadVoteServices();
  const now = new Date();
  for (const [index, serverId] of [leaderId, leaderId, followerId].entries()) {
    const result = await castVote({ serverId, nickname: `Votante${index}`, nicknameKey: `votante${index}`, ip: `203.0.113.${40 + index}`, now });
    assert.equal(result.status, "ok");
  }
  const leader = await getRankPosition(leaderId);
  const follower = await getRankPosition(followerId);
  assert.ok(leader !== null && follower !== null && leader < follower);

  const stats = await getServerVoteStats(leaderId, now);
  assert.equal(stats.votes, 2);
  assert.equal(stats.position, leader);
  assert.equal(stats.votesToday, 2);
});

test("only votes cast with an account make that account's opinions verified", testOptions, async () => {
  const serverId = await createRankedServer();
  const withAccount = await createUser();
  const withoutAccount = await createUser();
  const { castVote, getVerifiedVoters, getLatestAccountVote } = await loadVoteServices();
  await castVote({ serverId, nickname: "ConCuenta", nicknameKey: "concuenta", ip: "203.0.113.50", userId: withAccount });
  await castVote({ serverId, nickname: "SinCuenta", nicknameKey: "sincuenta", ip: "203.0.113.51" });
  const verified = await getVerifiedVoters(serverId, [withAccount, withoutAccount]);
  assert.deepEqual([...verified], [withAccount]);
  assert.equal((await getLatestAccountVote(serverId, withAccount))?.nickname, "ConCuenta");
  assert.equal(await getLatestAccountVote(serverId, withoutAccount), null);
});

test("IP hashes older than 30 days are cleared and the votes are kept", testOptions, async () => {
  const serverId = await createRankedServer();
  const { castVote, purgeExpiredVoteIpHashes } = await loadVoteServices();
  const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  await castVote({ serverId, nickname: "Antiguo", nicknameKey: "antiguo", ip: "203.0.113.60", now: old });
  await castVote({ serverId, nickname: "Reciente", nicknameKey: "reciente", ip: "203.0.113.61" });
  assert.ok(await purgeExpiredVoteIpHashes() >= 1);
  const rows = await database().query("select nickname, ip_hash from server_votes where server_id = $1 order by created_at", [serverId]);
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows[0].ip_hash, null);
  assert.notEqual(rows.rows[1].ip_hash, null);
});

test("the catalog's vote order, positions and featured opinions come from real votes", testOptions, async () => {
  const token = randomUUID().slice(0, 8);
  const quietId = await createRankedServer();
  const popularId = await createRankedServer();
  await database().query("update servers set name = $2 where id = $1", [quietId, `Ranking ${token} tranquilo`]);
  await database().query("update servers set name = $2 where id = $1", [popularId, `Ranking ${token} popular`]);
  const voterId = await createUser();
  const bystanderId = await createUser();
  const { castVote } = await loadVoteServices();
  const { votingMonth } = await import("../src/lib/votes/month.ts");
  const { listPublishedServersFromNeon, listRankingPositions } = await import("../src/lib/servers/queries.ts");
  const { getFeaturedOpinions } = await import("../src/lib/votes/featured-opinions.ts");
  const { countVerifiedReviews } = await import("../src/lib/servers/reviews.ts");

  await castVote({ serverId: popularId, nickname: "Fan_uno", nicknameKey: "fan_uno", ip: "203.0.113.70", userId: voterId });
  await castVote({ serverId: popularId, nickname: "Fan_dos", nicknameKey: "fan_dos", ip: "203.0.113.71" });
  await database().query(
    `insert into server_reviews (server_id, user_id, rating, content, created_at) values
       ($1, $2, 5, 'Opinión de alguien que no votó por el servidor, aunque es reciente.', now()),
       ($1, $3, 5, 'Opinión de quien sí votó: el staff responde rápido y no hay pay-to-win.', now() - interval '1 day')`,
    [popularId, bystanderId, voterId],
  );

  const month = votingMonth();
  const page = await listPublishedServersFromNeon({ query: `Ranking ${token}`, sort: "votes", month });
  assert.deepEqual(page.servers.map((server) => server.id), [popularId, quietId]);
  assert.equal(page.ranking?.[popularId]?.votes, 2);
  assert.equal(page.ranking?.[quietId]?.votes, 0);

  const positions = await listRankingPositions([quietId, popularId], month);
  assert.ok(positions[popularId].position < positions[quietId].position);

  const opinions = await getFeaturedOpinions([popularId, quietId]);
  assert.match(opinions.get(popularId)?.excerpt ?? "", /quien sí votó/);
  assert.equal(opinions.has(quietId), false);
  assert.equal(await countVerifiedReviews(popularId), 1);
});

test("Votifier settings keep the stored key when none is typed and never expose it", testOptions, async () => {
  const serverId = await createRankedServer();
  const ownerId = await createUser();
  await loadVoteServices();
  const { saveVotifierSettings, getVotifierSettingsView, getStoredVotifierSettings } = await import("../src/lib/votes/votifier-settings.ts");
  const { encryptVotifierSecret, decryptVotifierSecret } = await import("../src/lib/votes/votifier-secret.ts");

  await saveVotifierSettings(serverId, ownerId, { host: "play.example.com", port: 8192, keyType: "token", secretCiphertext: encryptVotifierSecret("token-secreto") });
  await saveVotifierSettings(serverId, ownerId, { host: "votos.example.com", port: 8193, keyType: "token", secretCiphertext: null });

  const view = await getVotifierSettingsView(serverId);
  assert.equal(view?.host, "votos.example.com");
  assert.equal(view?.port, 8193);
  assert.equal(Object.keys(view ?? {}).some((key) => /secret/i.test(key)), false);
  const stored = await getStoredVotifierSettings(serverId);
  assert.equal(decryptVotifierSecret(stored!.secretCiphertext), "token-secreto");
});
