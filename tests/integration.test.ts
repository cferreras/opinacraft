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
let reviewServices: typeof import("../src/lib/servers/reviews.ts") | null = null;
let adminServices: typeof import("../src/lib/admin.ts") | null = null;
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

test("player observations are atomic, deduplicated and preserve source history", testOptions, async () => {
  const ownerId = await createUser();
  const serverId = await createServerRecord({
    ownerId,
    endpoint: { host: "history.example.invalid", port: 25565, verificationStatus: "verified" },
  });
  const [{ history_source_id: historySourceId }] = (await database().query(
    "select history_source_id from server_endpoints where server_id = $1 and edition = 'java'",
    [serverId],
  )).rows;
  const { db } = await import("../src/db.ts");
  const { applyEndpointObservation } = await import("../src/lib/servers/monitor-persistence.ts");
  const sampledAt = new Date("2026-08-03T12:00:00.000Z");
  const observedAt = new Date("2026-08-03T12:00:30.000Z");
  const observation = {
    serverId,
    edition: "java" as const,
    historySourceId,
    sampledAt,
    observedAt,
    runId: randomUUID(),
    status: "online" as const,
    failureCode: null,
    playersCurrent: 12,
    playersMax: 100,
    version: "1.21",
    latencyMs: 42,
  };
  const first = await db.transaction((tx) => applyEndpointObservation(tx, observation));
  const duplicate = await db.transaction((tx) => applyEndpointObservation(tx, observation));
  assert.equal(first.persisted, true);
  assert.equal(duplicate.duplicate, true);

  const raw = await database().query("select count(*)::int as count from server_endpoint_player_snapshots where server_id = $1", [serverId]);
  const hourly = await database().query("select sample_count, players_total, players_peak from server_endpoint_player_hourly where server_id = $1 and edition = 'java'", [serverId]);
  assert.equal(raw.rows[0].count, 1);
  assert.deepEqual(hourly.rows[0], { sample_count: 1, players_total: "12", players_peak: 12 });

  const nextSource = randomUUID();
  await database().query("update server_endpoints set host = $2, history_source_id = $3 where server_id = $1 and edition = 'java'", [serverId, "new-history.example.invalid", nextSource]);
  await db.transaction((tx) => applyEndpointObservation(tx, { ...observation, sampledAt: new Date("2026-08-03T12:15:00.000Z"), observedAt: new Date("2026-08-03T12:15:30.000Z"), runId: randomUUID(), status: "offline", failureCode: "unreachable", historySourceId }));
  await db.transaction((tx) => applyEndpointObservation(tx, { ...observation, sampledAt: new Date("2026-08-03T12:30:00.000Z"), observedAt: new Date("2026-08-03T12:30:30.000Z"), runId: randomUUID(), historySourceId: nextSource, playersCurrent: 20 }));
  const current = await database().query("select health_status, players_current, last_checked_at from server_endpoints where server_id = $1 and edition = 'java'", [serverId]);
  assert.equal(current.rows[0].health_status, "online");
  assert.equal(current.rows[0].players_current, 20);
  assert.equal(current.rows[0].last_checked_at.toISOString(), "2026-08-03T12:30:30.000Z");
  const rows = await database().query("select count(*)::int as count, count(distinct history_source_id)::int as sources from server_endpoint_player_snapshots where server_id = $1", [serverId]);
  assert.deepEqual(rows.rows[0], { count: 3, sources: 2 });
});
