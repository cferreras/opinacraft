import "dotenv/config";

import { access, readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import sharp from "sharp";

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

const tags = [
  { id: "10000000-0000-4000-8000-000000000001", label: "Aventura", slug: "aventura" },
  { id: "10000000-0000-4000-8000-000000000002", label: "Construcción", slug: "construccion" },
  { id: "10000000-0000-4000-8000-000000000003", label: "Comunidad", slug: "comunidad" },
  { id: "10000000-0000-4000-8000-000000000004", label: "Crossplay", slug: "crossplay" },
  { id: "10000000-0000-4000-8000-000000000005", label: "Creativo", slug: "creativo" },
  { id: "10000000-0000-4000-8000-000000000006", label: "Economía", slug: "economia" },
  { id: "10000000-0000-4000-8000-000000000007", label: "Familiar", slug: "familiar" },
  { id: "10000000-0000-4000-8000-000000000008", label: "RPG", slug: "rpg" },
  { id: "10000000-0000-4000-8000-000000000009", label: "Supervivencia", slug: "supervivencia" },
  { id: "10000000-0000-4000-8000-000000000010", label: "Técnico", slug: "tecnico" },
  { id: "10000000-0000-4000-8000-000000000011", label: "Vanilla", slug: "vanilla" },
];

const seedServers = [
  // Runtime latency is deliberately left empty in fixtures. The monitor worker
  // is the only source of latency values shown in the public directory.
  {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Skyforge Realms",
    slug: "skyforge-realms",
    description: "Una red de aventuras aéreas, islas flotantes y temporadas cooperativas para construir tu propia leyenda.",
    websiteUrl: "https://skyforge.example",
    storeUrl: "https://store.skyforge.example",
    discordUrl: "https://discord.example/skyforge",
    publicationStatus: "published",
    verificationStatus: "verified",
    verifiedAt: "2026-07-30T18:00:00.000Z",
    createdAt: "2026-07-29T10:00:00.000Z",
    tags: ["aventura", "economia", "rpg"],
    endpoints: [
      { edition: "java", host: "play.skyforge.seed.test", port: 25565, healthStatus: "online", playersCurrent: 2147, playersMax: 4000, version: "1.21.8", latencyMs: null, minutesAgo: 4, lastOnlineDaysAgo: 0, consecutiveFailures: 0 },
    ],
    media: [{ kind: "banner", sourceFile: "skyforge-realms-banner.png", outputFile: "skyforge-realms-banner.webp" }],
    review: { rating: 5, content: "La comunidad está muy cuidada y siempre hay algo nuevo que explorar." },
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    name: "Astral Network",
    slug: "astral-network",
    description: "Supervivencia con economía, misiones y una progresión compartida entre Java y Bedrock.",
    websiteUrl: "https://astral.example",
    storeUrl: "https://store.astral.example",
    discordUrl: "https://discord.example/astral",
    publicationStatus: "published",
    verificationStatus: "verified",
    verifiedAt: "2026-07-30T16:30:00.000Z",
    createdAt: "2026-07-28T11:00:00.000Z",
    tags: ["supervivencia", "crossplay", "aventura"],
    endpoints: [
      { edition: "java", host: "play.astral.seed.test", port: 25565, healthStatus: "online", playersCurrent: 1843, playersMax: 3000, version: "1.21.8", latencyMs: null, minutesAgo: 7, lastOnlineDaysAgo: 0, consecutiveFailures: 0 },
      { edition: "bedrock", host: "bedrock.astral.seed.test", port: 19132, healthStatus: "online", playersCurrent: 611, playersMax: 1200, version: "1.21.80", latencyMs: null, minutesAgo: 7, lastOnlineDaysAgo: 0, consecutiveFailures: 0 },
    ],
    media: [{ kind: "logo", sourceFile: "astral-network-logo.png", outputFile: "astral-network-logo.webp" }],
    review: { rating: 4, content: "Buen equilibrio entre progreso, eventos y espacio para jugar tranquilo." },
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    name: "Verdant Isles",
    slug: "verdant-isles",
    description: "Islas verdes, ruinas antiguas y una comunidad relajada para explorar, construir y comerciar.",
    websiteUrl: "https://verdant.example",
    storeUrl: null,
    discordUrl: "https://discord.example/verdant",
    publicationStatus: "published",
    verificationStatus: "verified",
    verifiedAt: "2026-07-30T15:10:00.000Z",
    createdAt: "2026-07-27T09:30:00.000Z",
    tags: ["supervivencia", "crossplay", "comunidad"],
    endpoints: [
      { edition: "java", host: "play.verdant.seed.test", port: 25565, healthStatus: "online", playersCurrent: 766, playersMax: 1800, version: "1.21.7", latencyMs: null, minutesAgo: 10, lastOnlineDaysAgo: 0, consecutiveFailures: 0 },
      { edition: "bedrock", host: "bedrock.verdant.seed.test", port: 19132, healthStatus: "online", playersCurrent: 284, playersMax: 800, version: "1.21.80", latencyMs: null, minutesAgo: 10, lastOnlineDaysAgo: 0, consecutiveFailures: 0 },
    ],
    media: [{ kind: "logo", sourceFile: "verdant-isles-logo.png", outputFile: "verdant-isles-logo.webp" }],
    review: { rating: 4, content: "Un mundo precioso y con gente amable; las islas tienen mucha personalidad." },
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    name: "Redstone Republic",
    slug: "redstone-republic",
    description: "Un servidor técnico para automatizar, compartir diseños y llevar cada granja hasta el límite.",
    websiteUrl: "https://redstone.example",
    storeUrl: "https://store.redstone.example",
    discordUrl: "https://discord.example/redstone",
    publicationStatus: "published",
    verificationStatus: "verified",
    verifiedAt: "2026-07-30T12:00:00.000Z",
    createdAt: "2026-07-26T13:00:00.000Z",
    tags: ["tecnico", "construccion", "comunidad"],
    endpoints: [
      { edition: "java", host: "play.redstone.seed.test", port: 25565, healthStatus: "online", playersCurrent: 932, playersMax: 1500, version: "1.21.8", latencyMs: null, minutesAgo: 6, lastOnlineDaysAgo: 0, consecutiveFailures: 0 },
    ],
    media: [{ kind: "logo", sourceFile: "redstone-republic-logo.png", outputFile: "redstone-republic-logo.webp" }],
    review: { rating: 4, content: "Ideal si te gusta aprender mecanismos y ver cómo crecen los proyectos colectivos." },
  },
  {
    id: "20000000-0000-4000-8000-000000000005",
    name: "Bruma SMP",
    slug: "bruma-smp",
    description: "Supervivencia sencilla y sin prisas, con una pequeña comunidad que prioriza las buenas historias.",
    websiteUrl: "https://bruma.example",
    storeUrl: null,
    discordUrl: "https://discord.example/bruma",
    publicationStatus: "published",
    verificationStatus: "verified",
    verifiedAt: "2026-07-29T20:00:00.000Z",
    createdAt: "2026-07-25T08:00:00.000Z",
    tags: ["vanilla", "supervivencia", "comunidad"],
    endpoints: [
      { edition: "java", host: "play.bruma.seed.test", port: 25565, healthStatus: "offline", playersCurrent: 0, playersMax: 400, version: "1.21.7", latencyMs: null, minutesAgo: 8, lastOnlineDaysAgo: 1, consecutiveFailures: 3 },
    ],
    media: [],
    review: { rating: 3, content: "Un SMP pequeño y tranquilo; se nota que la comunidad se conoce bien." },
  },
  {
    id: "20000000-0000-4000-8000-000000000006",
    name: "Pixel Pioneros",
    slug: "pixel-pioneros",
    description: "Creatividad, construcciones compartidas y retos semanales para jugar en familia desde Bedrock.",
    websiteUrl: "https://pixelpioneros.example",
    storeUrl: null,
    discordUrl: "https://discord.example/pixel-pioneros",
    publicationStatus: "published",
    verificationStatus: "verified",
    verifiedAt: "2026-07-29T18:00:00.000Z",
    createdAt: "2026-07-24T15:00:00.000Z",
    tags: ["creativo", "construccion", "familiar"],
    endpoints: [
      { edition: "bedrock", host: "play.pixelpioneros.seed.test", port: 19132, healthStatus: "unknown", playersCurrent: null, playersMax: null, version: null, latencyMs: null, minutesAgo: null, lastOnlineDaysAgo: null, consecutiveFailures: 0 },
    ],
    media: [],
    review: { rating: 4, content: "Los retos semanales son fáciles de seguir y hay ideas muy originales." },
  },
  {
    id: "20000000-0000-4000-8000-000000000007",
    name: "Cobalto Creativo",
    slug: "cobalto-creativo",
    description: "Espacio de pruebas para builders y diseñadores que quieren preparar su próxima gran ciudad.",
    websiteUrl: "https://cobalto.example",
    storeUrl: null,
    discordUrl: null,
    publicationStatus: "draft",
    verificationStatus: "unverified",
    verifiedAt: null,
    createdAt: "2026-07-31T09:00:00.000Z",
    tags: ["creativo", "construccion", "tecnico"],
    endpoints: [
      { edition: "java", host: "play.cobalto.seed.test", port: 25565, healthStatus: "unknown", playersCurrent: null, playersMax: null, version: null, latencyMs: null, minutesAgo: null, lastOnlineDaysAgo: null, consecutiveFailures: 0 },
    ],
    media: [],
    review: null,
  },
  {
    id: "20000000-0000-4000-8000-000000000008",
    name: "Nube Nómada",
    slug: "nube-nomada",
    description: "Una comunidad en pausa mientras prepara su siguiente temporada de aventuras cooperativas.",
    websiteUrl: "https://nube.example",
    storeUrl: null,
    discordUrl: null,
    publicationStatus: "hidden",
    verificationStatus: "verified",
    verifiedAt: "2026-07-28T12:00:00.000Z",
    createdAt: "2026-07-23T09:00:00.000Z",
    tags: ["aventura", "comunidad"],
    endpoints: [
      { edition: "bedrock", host: "play.nube.seed.test", port: 19132, healthStatus: "online", playersCurrent: 88, playersMax: 300, version: "1.21.80", latencyMs: null, minutesAgo: 9, lastOnlineDaysAgo: 0, consecutiveFailures: 0 },
    ],
    media: [],
    review: null,
  },
];

const mediaLimits = {
  logo: { width: 1024, height: 1024, maxBytes: 500_000 },
  banner: { width: 1920, height: 640, maxBytes: 1_500_000 },
};

function seedDate(value) {
  return new Date(value);
}

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

async function upsertTag(client, tag) {
  const result = await client.query(
    `insert into tags (id, label, slug, status, usage_count, created_at, updated_at)
     values ($1, $2, $3, 'active', 0, now(), now())
     on conflict (slug) do update set label = excluded.label, status = 'active', updated_at = now()
     returning id`,
    [tag.id, tag.label, tag.slug],
  );
  return result.rows[0].id;
}

async function assertSeedSlugAvailable(client, server) {
  const result = await client.query("select id from servers where id = $1 or slug = $2 limit 1", [server.id, server.slug]);
  if (result.rows[0] && result.rows[0].id !== server.id) {
    throw new Error(`Seed slug is already used by another server: ${server.slug}`);
  }
}

async function upsertServer(client, server) {
  const result = await client.query(
    `insert into servers (
       id, name, slug, description, website_url, store_url, discord_url,
       moderation_status, publication_status, verification_status, verified_at,
       created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11, now())
     on conflict (id) do update set
       name = excluded.name,
       slug = excluded.slug,
       description = excluded.description,
       website_url = excluded.website_url,
       store_url = excluded.store_url,
       discord_url = excluded.discord_url,
       moderation_status = 'active',
       publication_status = excluded.publication_status,
       verification_status = excluded.verification_status,
       verified_at = excluded.verified_at,
       updated_at = now()
     returning id`,
    [
      server.id,
      server.name,
      server.slug,
      server.description,
      server.websiteUrl,
      server.storeUrl,
      server.discordUrl,
      server.publicationStatus,
      server.verificationStatus,
      server.verifiedAt ? seedDate(server.verifiedAt) : null,
      seedDate(server.createdAt),
    ],
  );
  return result.rows[0].id;
}

async function upsertEndpoint(client, server, endpoint) {
  const now = new Date();
  const lastCheckedAt = endpoint.minutesAgo === null ? null : new Date(now.getTime() - endpoint.minutesAgo * 60_000);
  const lastOnlineAt = endpoint.lastOnlineDaysAgo === null ? null : new Date(now.getTime() - endpoint.lastOnlineDaysAgo * 86_400_000);
  await client.query(
    `insert into server_endpoints (
       server_id, edition, host, port, verification_status, created_at, updated_at,
       health_status, players_current, players_max, version, latency_ms,
       last_checked_at, last_online_at, consecutive_failures
     ) values ($1, $2, $3, $4, $5, now(), now(), $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (server_id, edition) do update set
       host = excluded.host,
       port = excluded.port,
       verification_status = excluded.verification_status,
       updated_at = now(),
       health_status = excluded.health_status,
       players_current = excluded.players_current,
       players_max = excluded.players_max,
       version = excluded.version,
       latency_ms = excluded.latency_ms,
       last_checked_at = excluded.last_checked_at,
       last_online_at = excluded.last_online_at,
       consecutive_failures = excluded.consecutive_failures`,
    [
      server.id,
      endpoint.edition,
      endpoint.host,
      endpoint.port,
      server.verificationStatus === "verified" ? "verified" : "unverified",
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

async function upsertReview(client, server, review, index) {
  const reviewId = `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  await client.query(
    `insert into server_reviews (id, server_id, user_id, rating, content, status, created_at, updated_at)
     values ($1, $2, null, $3, $4, 'published', now(), now())
     on conflict (id) do update set rating = excluded.rating, content = excluded.content, status = 'published', updated_at = now()`,
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
  const serverIds = seedServers.map((server) => server.id);
  const tagIds = [];

  try {
    await client.query("begin");
    await client.query("set constraints all deferred");

    const owner = await ensureOwner(client);
    for (const tag of tags) tagIds.push(await upsertTag(client, tag));
    for (const server of seedServers) await assertSeedSlugAvailable(client, server);
    for (const server of seedServers) await upsertServer(client, server);

    await client.query("delete from server_tags where server_id = any($1::uuid[])", [serverIds]);
    await client.query("delete from server_media where server_id = any($1::uuid[])", [serverIds]);
    await client.query("delete from server_members where server_id = any($1::uuid[]) and role = 'owner' and user_id <> $2", [serverIds, owner.id]);

    const tagIdsBySlug = new Map(tags.map((tag, index) => [tag.slug, tagIds[index]]));
    for (const server of seedServers) {
      await client.query(
        "insert into server_members (server_id, user_id, role, joined_at) values ($1, $2, 'owner', now()) on conflict (server_id, user_id) do update set role = 'owner'",
        [server.id, owner.id],
      );
      for (const endpoint of server.endpoints) await upsertEndpoint(client, server, endpoint);
      for (const slug of server.tags) {
        await client.query("insert into server_tags (server_id, tag_id, created_at) values ($1, $2, now()) on conflict do nothing", [server.id, tagIdsBySlug.get(slug)]);
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
      if (server.review) await upsertReview(client, server, server.review, index);
    }

    await client.query(
      "update tags set usage_count = (select count(*)::int from server_tags where server_tags.tag_id = tags.id), updated_at = now() where id = any($1::uuid[])",
      [tagIds],
    );
    await client.query("commit");

    const publicCount = seedServers.filter((server) => server.publicationStatus === "published" && server.verificationStatus === "verified").length;
    const mediaCount = [...preparedMedia.values()].length;
    console.log(`Seeded ${seedServers.length} servers (${publicCount} public), ${tags.length} tags and ${mediaCount} local media assets.`);
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
