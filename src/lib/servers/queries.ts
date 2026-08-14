import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  serverEndpoints,
  serverMembers,
  serverVerifications,
  serverMedia,
  serverReviews,
  serverTags,
  servers,
  tags,
} from "@/schema";
import { getMonitorCadenceMinutes, getMonitorFreshness, type MonitorFreshness } from "./monitor-scheduling";

type ServerBase = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  storeUrl: string | null;
  discordUrl: string | null;
  publicationStatus: "draft" | "published" | "hidden";
  verificationStatus: "unverified" | "verified";
  createdAt: Date;
  updatedAt: Date;
  availabilityHiddenAt: Date | null;
  moderationStatus: "active" | "blocked";
  monitor: ServerMonitor;
};

export type ServerMonitor = {
  healthStatus: "unknown" | "online" | "offline";
  playersCurrent: number | null;
  playersMax: number | null;
  version: string | null;
  latencyMs: number | null;
  lastUpdatedAt: Date | null;
  lastOnlineAt: Date | null;
  consecutiveFailures: number;
  probeEdition: "java" | "bedrock" | null;
  cadenceMinutes: number | null;
  freshness: MonitorFreshness;
};

type RawServerBase = Omit<ServerBase, "monitor"> & {
  monitorHealthStatus: ServerMonitor["healthStatus"];
  monitorPlayersCurrent: number | null;
  monitorPlayersMax: number | null;
  monitorVersion: string | null;
  monitorLatencyMs: number | null;
  monitorLastCheckedAt: Date | null;
  monitorLastOnlineAt: Date | null;
  monitorConsecutiveFailures: number;
  monitorProbeEdition: ServerMonitor["probeEdition"];
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
export type PublicServerSort = "rating" | "players" | "recent";

const monitorColumns = {
  monitorHealthStatus: servers.monitorHealthStatus,
  monitorPlayersCurrent: servers.monitorPlayersCurrent,
  monitorPlayersMax: servers.monitorPlayersMax,
  monitorVersion: servers.monitorVersion,
  monitorLatencyMs: servers.monitorLatencyMs,
  monitorLastCheckedAt: servers.monitorLastCheckedAt,
  monitorLastOnlineAt: servers.monitorLastOnlineAt,
  monitorConsecutiveFailures: servers.monitorConsecutiveFailures,
  monitorProbeEdition: servers.monitorProbeEdition,
};

type ReviewSummaryLite = {
  reviewAverage: number | null;
  reviewCount: number;
};

export type CatalogServer = PublicServer & ReviewSummaryLite;

type ServerRow = {
  server: RawServerBase;
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

  const endpointWithFreshHealth = (endpoint: NonNullable<ServerRow["endpoint"]>) => endpoint;

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
      monitor: buildMonitorSummary({
        publicationStatus: row.server.publicationStatus,
        moderationStatus: row.server.moderationStatus,
        availabilityHiddenAt: row.server.availabilityHiddenAt,
         monitorHealthStatus: row.server.monitorHealthStatus,
         monitorPlayersCurrent: row.server.monitorPlayersCurrent,
         monitorPlayersMax: row.server.monitorPlayersMax,
         monitorVersion: row.server.monitorVersion,
         monitorLatencyMs: row.server.monitorLatencyMs,
         monitorLastCheckedAt: row.server.monitorLastCheckedAt,
         monitorLastOnlineAt: row.server.monitorLastOnlineAt,
         monitorConsecutiveFailures: row.server.monitorConsecutiveFailures,
         monitorProbeEdition: row.server.monitorProbeEdition,
         hasVerifiedEndpoint: Boolean(endpoint?.verificationStatus === "verified"),
       }),
      endpoints: endpoint ? [endpoint] : [],
      tags: [],
      media: [],
       aggregateStatus: row.server.monitorHealthStatus as AggregateHealthStatus,
    };
    grouped.set(
      row.server.id,
      row.role ? { ...server, role: row.role } : server,
    );
  }

  return [...grouped.values()].map((server) => {
    const cadenceMinutes = getMonitorCadenceMinutes({
      publicationStatus: server.publicationStatus,
      moderationStatus: server.moderationStatus,
      availabilityHiddenAt: server.availabilityHiddenAt,
      hasVerifiedEndpoint: server.endpoints.some((endpoint) => endpoint.verificationStatus === "verified"),
    });
    const monitor = cadenceMinutes === null
      ? { ...server.monitor, cadenceMinutes: null, freshness: "never" as const }
      : {
          ...server.monitor,
          cadenceMinutes,
          freshness: getMonitorFreshness(server.monitor.lastUpdatedAt, cadenceMinutes),
        };
    return { ...server, monitor, aggregateStatus: monitor.freshness === "fresh" ? monitor.healthStatus : "unknown" };
  });
}

function buildMonitorSummary(row: {
  publicationStatus: "draft" | "published" | "hidden";
  moderationStatus: "active" | "blocked";
  availabilityHiddenAt: Date | null;
  monitorHealthStatus: "unknown" | "online" | "offline";
  monitorPlayersCurrent: number | null;
  monitorPlayersMax: number | null;
  monitorVersion: string | null;
  monitorLatencyMs: number | null;
  monitorLastCheckedAt: Date | null;
  monitorLastOnlineAt: Date | null;
  monitorConsecutiveFailures: number;
  monitorProbeEdition: "java" | "bedrock" | null;
  cadenceMinutes?: number | null;
  hasVerifiedEndpoint?: boolean;
}): ServerMonitor {
  const cadenceMinutes = row.cadenceMinutes ?? getMonitorCadenceMinutes({
    publicationStatus: row.publicationStatus,
    moderationStatus: row.moderationStatus,
    availabilityHiddenAt: row.availabilityHiddenAt,
    hasVerifiedEndpoint: row.hasVerifiedEndpoint ?? (row.monitorProbeEdition !== null || row.monitorLastCheckedAt !== null),
  });
  return {
    healthStatus: row.monitorHealthStatus,
    playersCurrent: row.monitorPlayersCurrent,
    playersMax: row.monitorPlayersMax,
    version: row.monitorVersion,
    latencyMs: row.monitorLatencyMs,
    lastUpdatedAt: row.monitorLastCheckedAt,
    lastOnlineAt: row.monitorLastOnlineAt,
    consecutiveFailures: row.monitorConsecutiveFailures,
    probeEdition: row.monitorProbeEdition,
    cadenceMinutes,
    freshness: cadenceMinutes ? getMonitorFreshness(row.monitorLastCheckedAt, cadenceMinutes) : "never",
  };
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

async function attachReviewSummaries<T extends { id: string }>(items: T[]): Promise<Array<T & ReviewSummaryLite>> {
  if (items.length === 0) return [];

  const rows = await db
    .select({
      serverId: serverReviews.serverId,
      average: sql<string | null>`round(avg(${serverReviews.rating})::numeric, 1)`,
      count: sql<number>`count(*)::int`,
    })
    .from(serverReviews)
    .where(and(inArray(serverReviews.serverId, items.map((item) => item.id)), eq(serverReviews.status, "published")))
    .groupBy(serverReviews.serverId);
  const summaries = new Map(rows.map((row) => [row.serverId, { reviewAverage: row.average === null ? null : Number(row.average), reviewCount: row.count }]));

  return items.map((item) => ({
    ...item,
    reviewAverage: summaries.get(item.id)?.reviewAverage ?? null,
    reviewCount: summaries.get(item.id)?.reviewCount ?? 0,
  }));
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
        storeUrl: servers.storeUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        verificationStatus: servers.verificationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        availabilityHiddenAt: servers.availabilityHiddenAt,
        moderationStatus: servers.moderationStatus,
         ...monitorColumns,
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

export async function listPublishedServers({ page = 1, query = "", tagSlugs = [], edition, status, sort = "rating" }: { page?: number; query?: string; tagSlugs?: string[]; edition?: "java" | "bedrock"; status?: AggregateHealthStatus; sort?: PublicServerSort } = {}): Promise<{ servers: CatalogServer[]; hasNextPage: boolean; page: number }> {
  const safePage = Number.isSafeInteger(page) && page > 0
    ? Math.min(page, MAX_PUBLIC_SERVER_PAGE)
    : 1;
  const queryText = query.trim();
  const serverIds = await db
    .select({ id: servers.id })
    .from(servers)
    .where(and(
      eq(servers.publicationStatus, "published"),
      eq(servers.moderationStatus, "active"),
      eq(servers.verificationStatus, "verified"),
      isNull(servers.availabilityHiddenAt),
      queryText ? sql`(${ilike(servers.name, `%${queryText.slice(0, 80)}%`)} or ${ilike(servers.description, `%${queryText.slice(0, 80)}%`)} or similarity(lower(${servers.name}), lower(${queryText.slice(0, 80)})) > 0.2 or similarity(lower(coalesce(${servers.description}, '')), lower(${queryText.slice(0, 80)})) > 0.2 or exists (select 1 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id} and t.status = 'active' and (t.slug like ${`%${queryText.slice(0, 80).toLowerCase()}%`} or similarity(lower(t.slug), lower(${queryText.slice(0, 80)})) > 0.2)))` : undefined,
      edition ? sql`exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.edition = ${edition} and se.verification_status = 'verified')` : undefined,
      sql`exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.verification_status = 'verified')`,
      ...tagSlugs.slice(0, 8).map((slug) => sql`exists (select 1 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id} and t.slug = ${slug} and t.status = 'active')`),
      status ? sql`case when ${servers.monitorLastCheckedAt} is null then 'unknown' when ${servers.monitorLastCheckedAt} <= now() - (case when ${servers.publicationStatus} = 'published' and ${servers.moderationStatus} = 'active' and ${servers.availabilityHiddenAt} is null then interval '30 minutes' else interval '120 minutes' end) then 'unknown' else ${servers.monitorHealthStatus} end = ${status}` : undefined,
    ))
    .orderBy(
      ...(queryText
        ? [desc(sql`greatest(similarity(lower(${servers.name}), lower(${queryText.slice(0, 80)})) * 3, coalesce((select max(similarity(lower(t.slug), lower(${queryText.slice(0, 80)}))) * 2 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id}), 0), similarity(lower(coalesce(${servers.description}, '')), lower(${queryText.slice(0, 80)})))`)]
        : sort === "players"
          ? [desc(sql`coalesce(${servers.monitorPlayersCurrent}, 0)`)]
          : sort === "recent"
            ? [desc(servers.createdAt)]
            : [desc(sql`coalesce((select avg(sr.rating) from server_reviews sr where sr.server_id = ${servers.id} and sr.status = 'published'), 0)`)]),
      desc(servers.createdAt), desc(servers.id),
    )
    .limit(PUBLIC_SERVER_PAGE_SIZE + 1)
    .offset((safePage - 1) * PUBLIC_SERVER_PAGE_SIZE);
  const hasNextPage = serverIds.length > PUBLIC_SERVER_PAGE_SIZE;
  const ids = serverIds.slice(0, PUBLIC_SERVER_PAGE_SIZE).map(({ id }) => id);
  if (ids.length === 0) {
    const emptyServers: CatalogServer[] = [];
    return { servers: emptyServers, hasNextPage: false, page: safePage };
  }

  const rows = await db
    .select({
      server: {
        id: servers.id,
        name: servers.name,
        slug: servers.slug,
        description: servers.description,
        websiteUrl: servers.websiteUrl,
        storeUrl: servers.storeUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        verificationStatus: servers.verificationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        availabilityHiddenAt: servers.availabilityHiddenAt,
        moderationStatus: servers.moderationStatus,
         ...monitorColumns,
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
    .where(and(
      inArray(servers.id, ids),
      eq(servers.moderationStatus, "active"),
      eq(serverEndpoints.verificationStatus, "verified"),
      edition ? eq(serverEndpoints.edition, edition) : undefined,
    ))
    .orderBy(desc(servers.createdAt), desc(servers.id), asc(serverEndpoints.edition));

  const rank = new Map(ids.map((id, index) => [id, index]));
  const orderedServers = groupServerRows(rows).sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
  );
  const catalogServers = await attachCatalogData(orderedServers);
  return { servers: await attachReviewSummaries(catalogServers), hasNextPage, page: safePage };
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
        storeUrl: servers.storeUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        verificationStatus: servers.verificationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        availabilityHiddenAt: servers.availabilityHiddenAt,
        moderationStatus: servers.moderationStatus,
         ...monitorColumns,
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
      storeUrl: servers.storeUrl,
      discordUrl: servers.discordUrl,
      publicationStatus: servers.publicationStatus,
      verificationStatus: servers.verificationStatus,
      verifiedAt: servers.verifiedAt,
      createdAt: servers.createdAt,
      updatedAt: servers.updatedAt,
      availabilityHiddenAt: servers.availabilityHiddenAt,
      moderationStatus: servers.moderationStatus,
      monitorHealthStatus: servers.monitorHealthStatus,
      monitorPlayersCurrent: servers.monitorPlayersCurrent,
      monitorPlayersMax: servers.monitorPlayersMax,
      monitorVersion: servers.monitorVersion,
      monitorLatencyMs: servers.monitorLatencyMs,
      monitorLastCheckedAt: servers.monitorLastCheckedAt,
      monitorLastOnlineAt: servers.monitorLastOnlineAt,
      monitorConsecutiveFailures: servers.monitorConsecutiveFailures,
      monitorProbeEdition: servers.monitorProbeEdition,
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
    monitor: buildMonitorSummary({
      publicationStatus: server.publicationStatus,
      moderationStatus: server.moderationStatus,
      availabilityHiddenAt: server.availabilityHiddenAt,
      monitorHealthStatus: server.monitorHealthStatus,
      monitorPlayersCurrent: server.monitorPlayersCurrent,
      monitorPlayersMax: server.monitorPlayersMax,
      monitorVersion: server.monitorVersion,
      monitorLatencyMs: server.monitorLatencyMs,
      monitorLastCheckedAt: server.monitorLastCheckedAt,
      monitorLastOnlineAt: server.monitorLastOnlineAt,
      monitorConsecutiveFailures: server.monitorConsecutiveFailures,
      monitorProbeEdition: server.monitorProbeEdition,
      hasVerifiedEndpoint: endpoints.some((endpoint) => endpoint.verificationStatus === "verified"),
    }),
    endpoints,
    tags: catalog?.tags ?? [],
    media: catalog?.media ?? [],
    latestVerification: latestVerification[0] ?? null,
  };
}
