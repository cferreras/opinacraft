import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  serverEndpoints,
  serverMembers,
  serverVerifications,
  serverMedia,
  serverTags,
  servers,
  tags,
} from "@/schema";

type ServerBase = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  discordUrl: string | null;
  publicationStatus: "draft" | "published" | "hidden";
  verificationStatus: "unverified" | "verified";
  createdAt: Date;
  updatedAt: Date;
  availabilityHiddenAt: Date | null;
};

export type ServerTag = { label: string; slug: string };
export type ServerMedia = {
  kind: "logo" | "banner";
  url: string;
  width: number | null;
  height: number | null;
};

export type ManagedServer = ServerBase & {
  aggregateStatus: AggregateHealthStatus;
  role: "owner" | "admin" | "editor";
  endpoints: Array<{
    edition: "java" | "bedrock";
    host: string;
    port: number;
    verificationStatus: "unverified" | "verified";
    healthStatus: "unknown" | "online" | "offline";
    playersCurrent: number | null;
    playersMax: number | null;
    version: string | null;
    latencyMs: number | null;
    lastCheckedAt: Date | null;
    consecutiveFailures: number;
  }>;
  tags: ServerTag[];
  media: ServerMedia[];
};

export const PUBLIC_SERVER_PAGE_SIZE = 24;
const MAX_PUBLIC_SERVER_PAGE = 10_000;

export type PublicServer = Omit<ManagedServer, "role">;
export type AggregateHealthStatus = "online" | "offline" | "unknown";

type ServerRow = {
  server: ServerBase;
  role?: ManagedServer["role"] | null;
  endpoint: {
    edition: ManagedServer["endpoints"][number]["edition"];
    host: string;
    port: number;
    verificationStatus: ManagedServer["endpoints"][number]["verificationStatus"];
    healthStatus: ManagedServer["endpoints"][number]["healthStatus"];
    playersCurrent: number | null;
    playersMax: number | null;
    version: string | null;
    latencyMs: number | null;
    lastCheckedAt: Date | null;
    consecutiveFailures: number;
  } | null;
};

type ManagedServerRow = ServerRow & { role: ManagedServer["role"] };
type PublicServerRow = ServerRow & { role?: null };

function groupServerRows(rows: ManagedServerRow[]): ManagedServer[];
function groupServerRows(rows: PublicServerRow[]): PublicServer[];
function groupServerRows(rows: ServerRow[]): Array<ManagedServer | PublicServer> {
  const grouped = new Map<string, ManagedServer | PublicServer>();

  const endpointWithFreshHealth = (endpoint: NonNullable<ServerRow["endpoint"]>) => ({
    ...endpoint,
    healthStatus: endpoint.lastCheckedAt && Date.now() - endpoint.lastCheckedAt.getTime() > 30 * 60 * 1000 ? "unknown" as const : endpoint.healthStatus,
  });

  for (const row of rows) {
    const existing = grouped.get(row.server.id);
    const endpoint = row.endpoint ? endpointWithFreshHealth(row.endpoint) : null;

    if (existing) {
      if (endpoint && !existing.endpoints.some((item) => item.edition === endpoint.edition)) {
        existing.endpoints.push(endpoint);
      }
      continue;
    }

    const server = {
      ...row.server,
      endpoints: endpoint ? [endpoint] : [],
      tags: [],
      media: [],
      aggregateStatus: "unknown" as AggregateHealthStatus,
    };
    grouped.set(
      row.server.id,
      row.role ? { ...server, role: row.role } : server,
    );
  }

  return [...grouped.values()].map((server) => {
    const fresh = server.endpoints.filter((endpoint) => endpoint.lastCheckedAt && Date.now() - endpoint.lastCheckedAt.getTime() <= 30 * 60 * 1000);
    const aggregateStatus: AggregateHealthStatus = fresh.some((endpoint) => endpoint.healthStatus === "online")
      ? "online"
      : fresh.length === server.endpoints.length && fresh.length > 0 && fresh.every((endpoint) => endpoint.healthStatus === "offline")
        ? "offline"
        : "unknown";
    return { ...server, aggregateStatus };
  });
}

async function attachCatalogData<T extends { id: string; tags: ServerTag[]; media: ServerMedia[] }>(items: T[]) {
  if (items.length === 0) return items;
  const ids = items.map((item) => item.id);
  const [tagRows, mediaRows] = await Promise.all([
    db
      .select({ serverId: serverTags.serverId, label: tags.label, slug: tags.slug })
      .from(serverTags)
      .innerJoin(tags, eq(serverTags.tagId, tags.id))
      .where(and(inArray(serverTags.serverId, ids), eq(tags.status, "active")))
      .orderBy(asc(serverTags.serverId), asc(tags.slug)),
    db
      .select({
        serverId: serverMedia.serverId,
        kind: serverMedia.kind,
        url: serverMedia.blobUrl,
        width: serverMedia.width,
        height: serverMedia.height,
      })
      .from(serverMedia)
      .where(and(inArray(serverMedia.serverId, ids), eq(serverMedia.status, "active")))
      .orderBy(asc(serverMedia.serverId), asc(serverMedia.kind)),
  ]);
  const tagsByServer = new Map<string, ServerTag[]>();
  for (const row of tagRows) tagsByServer.set(row.serverId, [...(tagsByServer.get(row.serverId) ?? []), row]);
  const mediaByServer = new Map<string, ServerMedia[]>();
  for (const row of mediaRows) {
    if (!row.url) continue;
    mediaByServer.set(row.serverId, [...(mediaByServer.get(row.serverId) ?? []), { kind: row.kind, url: row.url, width: row.width, height: row.height }]);
  }
  return items.map((item) => ({ ...item, tags: tagsByServer.get(item.id) ?? [], media: mediaByServer.get(item.id) ?? [] }));
}

export async function listManagedServers(userId: string) {
  const rows = await db
    .select({
      server: {
        id: servers.id,
        name: servers.name,
        slug: servers.slug,
        description: servers.description,
        websiteUrl: servers.websiteUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        verificationStatus: servers.verificationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        availabilityHiddenAt: servers.availabilityHiddenAt,
      },
      role: serverMembers.role,
      endpoint: {
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
        verificationStatus: serverEndpoints.verificationStatus,
        healthStatus: serverEndpoints.healthStatus,
        playersCurrent: serverEndpoints.playersCurrent,
        playersMax: serverEndpoints.playersMax,
        version: serverEndpoints.version,
        latencyMs: serverEndpoints.latencyMs,
        lastCheckedAt: serverEndpoints.lastCheckedAt,
        consecutiveFailures: serverEndpoints.consecutiveFailures,
      },
    })
    .from(serverMembers)
    .innerJoin(servers, eq(serverMembers.serverId, servers.id))
    .leftJoin(serverEndpoints, eq(serverEndpoints.serverId, servers.id))
    .where(eq(serverMembers.userId, userId))
    .orderBy(desc(servers.createdAt), asc(serverEndpoints.edition));

  return attachCatalogData(groupServerRows(rows));
}

export async function listPublishedServers({ page = 1, query = "", tagSlugs = [], edition, status }: { page?: number; query?: string; tagSlugs?: string[]; edition?: "java" | "bedrock"; status?: AggregateHealthStatus } = {}) {
  const safePage = Number.isSafeInteger(page) && page > 0
    ? Math.min(page, MAX_PUBLIC_SERVER_PAGE)
    : 1;
  const serverIds = await db
    .select({ id: servers.id })
    .from(servers)
    .where(and(
      eq(servers.publicationStatus, "published"),
      eq(servers.moderationStatus, "active"),
      eq(servers.verificationStatus, "verified"),
      isNull(servers.availabilityHiddenAt),
      query.trim() ? sql`(${ilike(servers.name, `%${query.trim().slice(0, 80)}%`)} or ${ilike(servers.description, `%${query.trim().slice(0, 80)}%`)} or similarity(lower(${servers.name}), lower(${query.trim().slice(0, 80)})) > 0.2 or similarity(lower(coalesce(${servers.description}, '')), lower(${query.trim().slice(0, 80)})) > 0.2 or exists (select 1 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id} and t.status = 'active' and (t.slug like ${`%${query.trim().slice(0, 80).toLowerCase()}%`} or similarity(lower(t.slug), lower(${query.trim().slice(0, 80)})) > 0.2)))` : undefined,
      edition ? sql`exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.edition = ${edition})` : undefined,
      sql`exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.verification_status = 'verified')`,
      ...tagSlugs.slice(0, 8).map((slug) => sql`exists (select 1 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id} and t.slug = ${slug} and t.status = 'active')`),
      status ? sql`case when exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.verification_status = 'verified' and se.health_status = 'online' and se.last_checked_at > now() - interval '30 minutes') then 'online' when not exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.verification_status = 'verified' and (se.last_checked_at is null or se.last_checked_at <= now() - interval '30 minutes' or se.health_status <> 'offline')) then 'offline' else 'unknown' end = ${status}` : undefined,
    ))
    .orderBy(
      query.trim() ? desc(sql`greatest(similarity(lower(${servers.name}), lower(${query.trim().slice(0, 80)})) * 3, coalesce((select max(similarity(lower(t.slug), lower(${query.trim().slice(0, 80)}))) * 2 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id}), 0), similarity(lower(coalesce(${servers.description}, '')), lower(${query.trim().slice(0, 80)})))`) : desc(sql`case when exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.health_status = 'online' and se.last_checked_at > now() - interval '30 minutes') then 3 when exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and (se.last_checked_at is null or se.last_checked_at <= now() - interval '30 minutes' or se.health_status = 'unknown')) then 2 else 1 end`),
      desc(servers.createdAt), desc(servers.id),
    )
    .limit(PUBLIC_SERVER_PAGE_SIZE + 1)
    .offset((safePage - 1) * PUBLIC_SERVER_PAGE_SIZE);
  const hasNextPage = serverIds.length > PUBLIC_SERVER_PAGE_SIZE;
  const ids = serverIds.slice(0, PUBLIC_SERVER_PAGE_SIZE).map(({ id }) => id);
  if (ids.length === 0) {
    return { servers: [], hasNextPage: false, page: safePage };
  }

  const rows = await db
    .select({
      server: {
        id: servers.id,
        name: servers.name,
        slug: servers.slug,
        description: servers.description,
        websiteUrl: servers.websiteUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        verificationStatus: servers.verificationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        availabilityHiddenAt: servers.availabilityHiddenAt,
      },
      endpoint: {
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
        verificationStatus: serverEndpoints.verificationStatus,
        healthStatus: serverEndpoints.healthStatus,
        playersCurrent: serverEndpoints.playersCurrent,
        playersMax: serverEndpoints.playersMax,
        version: serverEndpoints.version,
        latencyMs: serverEndpoints.latencyMs,
        lastCheckedAt: serverEndpoints.lastCheckedAt,
        consecutiveFailures: serverEndpoints.consecutiveFailures,
      },
    })
    .from(servers)
    .leftJoin(serverEndpoints, eq(serverEndpoints.serverId, servers.id))
    .where(and(inArray(servers.id, ids), eq(servers.moderationStatus, "active"), eq(serverEndpoints.verificationStatus, "verified")))
    .orderBy(desc(servers.createdAt), desc(servers.id), asc(serverEndpoints.edition));

  return { servers: await attachCatalogData(groupServerRows(rows)), hasNextPage, page: safePage };
}

export async function getPublishedServerBySlug(slug: string) {
  const rows = await db
    .select({
      server: {
        id: servers.id,
        name: servers.name,
        slug: servers.slug,
        description: servers.description,
        websiteUrl: servers.websiteUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        verificationStatus: servers.verificationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        availabilityHiddenAt: servers.availabilityHiddenAt,
      },
      endpoint: {
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
        verificationStatus: serverEndpoints.verificationStatus,
        healthStatus: serverEndpoints.healthStatus,
        playersCurrent: serverEndpoints.playersCurrent,
        playersMax: serverEndpoints.playersMax,
        version: serverEndpoints.version,
        latencyMs: serverEndpoints.latencyMs,
        lastCheckedAt: serverEndpoints.lastCheckedAt,
        consecutiveFailures: serverEndpoints.consecutiveFailures,
      },
    })
    .from(servers)
    .leftJoin(serverEndpoints, eq(serverEndpoints.serverId, servers.id))
    .where(
      and(eq(servers.slug, slug), eq(servers.publicationStatus, "published"), eq(servers.moderationStatus, "active"), eq(servers.verificationStatus, "verified"), isNull(servers.availabilityHiddenAt), eq(serverEndpoints.verificationStatus, "verified")),
    )
    .orderBy(asc(serverEndpoints.edition));

  if (rows.length === 0) {
    return null;
  }

  return (await attachCatalogData(groupServerRows(rows)))[0] ?? null;
}

export async function getManagedServerBySlug(slug: string, userId: string) {
  const [server] = await db
    .select({
      id: servers.id,
      name: servers.name,
      slug: servers.slug,
      description: servers.description,
      websiteUrl: servers.websiteUrl,
      discordUrl: servers.discordUrl,
      publicationStatus: servers.publicationStatus,
      verificationStatus: servers.verificationStatus,
      verifiedAt: servers.verifiedAt,
      createdAt: servers.createdAt,
      updatedAt: servers.updatedAt,
      availabilityHiddenAt: servers.availabilityHiddenAt,
      role: serverMembers.role,
    })
    .from(servers)
    .innerJoin(serverMembers, eq(serverMembers.serverId, servers.id))
    .where(and(eq(servers.slug, slug), eq(serverMembers.userId, userId)))
    .limit(1);

  if (!server) return null;

  const [endpoints, latestVerification] = await Promise.all([
    db
      .select({
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
        verificationStatus: serverEndpoints.verificationStatus,
        healthStatus: serverEndpoints.healthStatus,
        playersCurrent: serverEndpoints.playersCurrent,
        playersMax: serverEndpoints.playersMax,
        version: serverEndpoints.version,
        latencyMs: serverEndpoints.latencyMs,
        lastCheckedAt: serverEndpoints.lastCheckedAt,
        consecutiveFailures: serverEndpoints.consecutiveFailures,
      })
      .from(serverEndpoints)
      .where(eq(serverEndpoints.serverId, server.id))
      .orderBy(asc(serverEndpoints.edition)),
    db
      .select({
        id: serverVerifications.id,
        status: serverVerifications.status,
        attemptCount: serverVerifications.attemptCount,
        lastFailureCode: serverVerifications.lastFailureCode,
        lastAttemptAt: serverVerifications.lastAttemptAt,
        expiresAt: serverVerifications.expiresAt,
        verifiedAt: serverVerifications.verifiedAt,
      })
      .from(serverVerifications)
      .where(eq(serverVerifications.serverId, server.id))
      .orderBy(desc(serverVerifications.createdAt))
      .limit(1),
  ]);

  const [catalog] = await attachCatalogData([{
    ...server,
    tags: [],
    media: [],
  }]);
  return {
    ...server,
    endpoints,
    tags: catalog?.tags ?? [],
    media: catalog?.media ?? [],
    latestVerification: latestVerification[0] ?? null,
  };
}
