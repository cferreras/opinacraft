import "dotenv/config";

import { access, readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import sharp from "sharp";

import { seedServers } from "./seed-local-data.mjs";

const { Pool } = pg;

const databaseUrl = process.env.SEED_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set SEED_DATABASE_URL, DIRECT_DATABASE_URL or DATABASE_URL before seeding.");
}

const seedOwner = {
  id: "seed-local-owner",
  name: "OpinaCraft Seed Owner",
  email: "seed.owner@local.opinacraft",
};

const mediaLimits = {
  logo: { width: 1024, height: 1024, maxBytes: 500_000 },
  banner: { width: 1920, height: 640, maxBytes: 1_500_000 },
};

function assetUrl(fileName) {
  return new URL(`../public/seed/${fileName}`, import.meta.url);
}

async function optimizeSeedAsset(media) {
  const outputPath = assetUrl(media.outputFile);
  try {
    await access(outputPath);
  } catch {
    const source = await readFile(assetUrl(media.sourceFile));
    const limit = mediaLimits[media.kind];
    let quality = 82;
    let output = await sharp(source)
      .rotate()
      .resize({ width: limit.width, height: limit.height, fit: media.kind === "banner" ? "cover" : "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    while (output.data.byteLength > limit.maxBytes && quality > 55) {
      quality -= 7;
      output = await sharp(source)
        .rotate()
        .resize({ width: limit.width, height: limit.height, fit: media.kind === "banner" ? "cover" : "inside", withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
    }

    if (output.data.byteLength > limit.maxBytes) {
      throw new Error(`Optimized ${media.kind} asset is larger than ${limit.maxBytes} bytes: ${media.sourceFile}`);
    }
    await writeFile(outputPath, output.data);
  }

  const body = await readFile(outputPath);
  const metadata = await sharp(body).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read dimensions for ${media.outputFile}`);
  }

  return {
    blobKey: `seed/${media.outputFile}`,
    blobUrl: `/seed/${media.outputFile}`,
    contentType: "image/webp",
    bytes: body.byteLength,
    width: metadata.width,
    height: metadata.height,
  };
}

async function ensureOwner(client) {
  const existing = await client.query(
    'select id, name, email from "user" where id = $1 or email = $2 limit 1',
    [seedOwner.id, seedOwner.email],
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query(
    'insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now()) returning id, name, email',
    [seedOwner.id, seedOwner.name, seedOwner.email],
  );
  return inserted.rows[0];
}

function endpointTimes(endpoint, now) {
  return {
    lastCheckedAt: endpoint.minutesAgo === null ? null : new Date(now.getTime() - endpoint.minutesAgo * 60_000),
    lastOnlineAt: endpoint.lastOnlineDaysAgo === null ? null : new Date(now.getTime() - endpoint.lastOnlineDaysAgo * 86_400_000),
  };
}

function latestDate(values) {
  const timestamps = values.filter(Boolean).map((value) => value.getTime());
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

function aggregateMonitor(server, now) {
  const endpointData = server.endpoints.map((endpoint) => ({ endpoint, ...endpointTimes(endpoint, now) }));
  const online = endpointData.filter(({ endpoint }) => endpoint.healthStatus === "online");
  const aggregateStatus = online.length > 0
    ? "online"
    : endpointData.every(({ endpoint }) => endpoint.healthStatus === "offline")
      ? "offline"
      : "unknown";
  const currentValues = online.map(({ endpoint }) => endpoint.playersCurrent).filter(Number.isInteger);
  const maximumValues = online.map(({ endpoint }) => endpoint.playersMax).filter(Number.isInteger);

  return {
    aggregateStatus,
    playersCurrent: currentValues.length ? Math.max(...currentValues) : aggregateStatus === "offline" ? 0 : null,
    playersMax: maximumValues.length ? Math.max(...maximumValues) : null,
    version: online.find(({ endpoint }) => endpoint.version)?.endpoint.version
      ?? endpointData.find(({ endpoint }) => endpoint.version)?.endpoint.version
      ?? null,
    latencyMs: null,
    lastCheckedAt: latestDate(endpointData.map(({ lastCheckedAt }) => lastCheckedAt)),
    lastOnlineAt: latestDate(endpointData.map(({ lastOnlineAt }) => lastOnlineAt)),
    consecutiveFailures: Math.max(...endpointData.map(({ endpoint }) => endpoint.consecutiveFailures)),
    probeEdition: server.endpoints[0]?.edition ?? null,
  };
}

async function insertServer(client, server, now) {
  const monitor = aggregateMonitor(server, now);
  await client.query(
    `insert into servers (
       id, name, slug, description, website_url, store_url, discord_url, country,
       access_type, access_form_url, account_mode, auth_mode, moderation_status,
       publication_status, verification_status, verified_at,
       monitor_health_status, monitor_players_current, monitor_players_max,
       monitor_version, monitor_latency_ms, monitor_last_checked_at, monitor_last_online_at,
       monitor_consecutive_failures, monitor_probe_edition, created_at, updated_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, 'active',
       $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now()
     )`,
    [
      server.id,
      server.name,
      server.slug,
      server.description,
      server.websiteUrl,
      server.storeUrl,
      server.discordUrl,
      server.country,
      server.accessType,
      server.accessFormUrl,
      server.accountMode,
      server.authMode,
      server.publicationStatus,
      server.verificationStatus,
      new Date(server.verifiedAt),
      monitor.aggregateStatus,
      monitor.playersCurrent,
      monitor.playersMax,
      monitor.version,
      monitor.latencyMs,
      monitor.lastCheckedAt,
      monitor.lastOnlineAt,
      monitor.consecutiveFailures,
      monitor.probeEdition,
      new Date(server.createdAt),
    ],
  );
}

async function insertEndpoint(client, server, endpoint, now) {
  const { lastCheckedAt, lastOnlineAt } = endpointTimes(endpoint, now);
  await client.query(
    `insert into server_endpoints (
       server_id, edition, host, port, verification_status, created_at, updated_at,
       health_status, players_current, players_max, version, latency_ms,
       last_checked_at, last_online_at, consecutive_failures
     ) values ($1, $2, $3, $4, 'verified', now(), now(), $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      server.id,
      endpoint.edition,
      endpoint.host,
      endpoint.port,
      endpoint.healthStatus,
      endpoint.playersCurrent,
      endpoint.playersMax,
      endpoint.version,
      endpoint.latencyMs,
      lastCheckedAt,
      lastOnlineAt,
      endpoint.consecutiveFailures,
    ],
  );
}

async function insertReview(client, server, review, index) {
  const reviewId = `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  await client.query(
    `insert into server_reviews (id, server_id, user_id, rating, content, status, created_at, updated_at)
     values ($1, $2, null, $3, $4, 'published', now(), now())`,
    [reviewId, server.id, review.rating, review.content],
  );
}

async function seed() {
  const preparedMedia = new Map();
  for (const server of seedServers) {
    for (const media of server.media) {
      preparedMedia.set(`${server.id}:${media.kind}`, await optimizeSeedAsset(media));
    }
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();
  const now = new Date();

  try {
    const target = await client.query("select current_database() as database_name");
    await client.query("begin");
    await client.query("set constraints all deferred");

    const owner = await ensureOwner(client);
    const previous = await client.query("select count(*)::int as count from servers");
    await client.query("delete from servers");
    await client.query("delete from server_monitor_sync_outbox");

    for (const server of seedServers) {
      await insertServer(client, server, now);
      await client.query(
        "insert into server_members (server_id, user_id, role, joined_at) values ($1, $2, 'owner', now())",
        [server.id, owner.id],
      );

      for (const endpoint of server.endpoints) await insertEndpoint(client, server, endpoint, now);
      for (const [position, mode] of server.gameModes.entries()) {
        await client.query(
          "insert into server_game_modes (server_id, mode, position, created_at) values ($1, $2, $3, now())",
          [server.id, mode, position],
        );
      }
      for (const media of server.media) {
        const prepared = preparedMedia.get(`${server.id}:${media.kind}`);
        await client.query(
          `insert into server_media (server_id, kind, blob_key, blob_url, content_type, bytes, width, height, status, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now(), now())`,
          [server.id, media.kind, prepared.blobKey, prepared.blobUrl, prepared.contentType, prepared.bytes, prepared.width, prepared.height],
        );
      }
    }

    for (const [index, server] of seedServers.entries()) {
      if (server.review) await insertReview(client, server, server.review, index);
    }

    const verification = await client.query(
      `select
         count(*)::int as total,
         count(*) filter (where publication_status = 'published' and verification_status = 'verified')::int as public_total,
         count(distinct country)::int as country_total
       from servers`,
    );
    const invalidLatency = await client.query(
      "select count(*)::int as count from server_endpoints where latency_ms is not null",
    );
    const counts = verification.rows[0];
    if (counts.total !== 60 || counts.public_total !== 60 || counts.country_total < 12 || invalidLatency.rows[0].count !== 0) {
      throw new Error(`Seed verification failed: ${JSON.stringify({ ...counts, latencyRows: invalidLatency.rows[0].count })}`);
    }

    await client.query("commit");

    console.log(`Database: ${target.rows[0].database_name}`);
    console.log(`Replaced ${previous.rows[0].count} existing servers with ${counts.total} seeded public servers across ${counts.country_total} countries.`);
    console.log(`Seeded ${preparedMedia.size} local media assets; endpoint latency remains monitor-owned.`);
    console.log(`Seed owner: ${owner.name} <${owner.email}> (${owner.id})`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await seed();
