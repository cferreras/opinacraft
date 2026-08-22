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
import { fetchMonitorStatuses, isMonitorApiConfigured, queryMonitorCatalog } from "./monitor-api-client";
import type { MonitorStatusView } from "@/lib/monitor/repository";

type ServerBase = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  storeUrl: string | null;
  discordUrl: string | null;
  accessType: "open" | "whitelist";
  accessFormUrl: string | null;
  accountMode: "premium_only" | "premium_and_non_premium";
  authMode: "direct" | "password_non_premium" | "password_all";
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
  offlineSince: Date | null;
  lastRecoveredAt: Date | null;
  lastStateChangeAt: Date | null;
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
export type PublicServerTableSort = "name" | "edition" | "players" | "version" | "latency" | "rating" | "ip";
export type PublicServerSortDirection = "asc" | "desc";

const publicServerTableSorts: PublicServerTableSort[] = ["name", "edition", "players", "version", "latency", "rating", "ip"];

export function isPublicServerTableSort(value: string | undefined): value is PublicServerTableSort {
  return value !== undefined && publicServerTableSorts.includes(value as PublicServerTableSort);
}

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
    offlineSince: null,
    lastRecoveredAt: null,
    lastStateChangeAt: null,
    consecutiveFailures: row.monitorConsecutiveFailures,
    probeEdition: row.monitorProbeEdition,
    cadenceMinutes,
    freshness: cadenceMinutes ? getMonitorFreshness(row.monitorLastCheckedAt, cadenceMinutes) : "never",
  };
}

export function monitorFromApi<T extends PublicServer>(server: T, state: MonitorStatusView | null): T {
  if (!state) {
    return {
      ...server,
      aggregateStatus: "unknown",
      monitor: {
        ...server.monitor,
        healthStatus: "unknown",
        playersCurrent: null,
        playersMax: null,
        version: null,
        latencyMs: null,
        lastUpdatedAt: null,
        lastOnlineAt: null,
        offlineSince: null,
        lastRecoveredAt: null,
        lastStateChangeAt: null,
        freshness: "never",
      },
    } as T;
  }
  const monitor = {
    ...server.monitor,
    healthStatus: state.healthStatus,
    playersCurrent: state.playersCurrent,
    playersMax: state.playersMax,
    version: state.version,
    latencyMs: state.latencyMs,
    lastUpdatedAt: state.lastCheckedAt ? new Date(state.lastCheckedAt) : null,
    lastOnlineAt: state.lastOnlineAt ? new Date(state.lastOnlineAt) : null,
    offlineSince: state.offlineSince ? new Date(state.offlineSince) : null,
    lastRecoveredAt: state.lastRecoveredAt ? new Date(state.lastRecoveredAt) : null,
    lastStateChangeAt: state.lastStateChangeAt ? new Date(state.lastStateChangeAt) : null,
    consecutiveFailures: state.consecutiveFailures,
    probeEdition: state.probeEdition,
    cadenceMinutes: state.cadenceMinutes,
    freshness: state.freshness,
  } satisfies ServerMonitor;
  return { ...server, monitor, aggregateStatus: state.freshness === "fresh" ? state.healthStatus : "unknown" } as T;
}

export async function attachMonitorApiStatuses<T extends PublicServer>(items: T[], options: Pick<RequestInit, "cache"> = {}) {
  if (!items.length || !isMonitorApiConfigured()) return items;
  let states: MonitorStatusView[] = [];
  try {
    states = await fetchMonitorStatuses(items.map((item) => item.id), options) ?? [];
  } catch (error) {
    console.error("[monitor] status batch unavailable", error instanceof Error ? error.name : "unknown");
  }
  const byId = new Map(states.map((state) => [state.serverId, state]));
  return items.map((item) => monitorFromApi(item, byId.get(item.id) ?? null));
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

function tableSortOrder(sort: PublicServerTableSort, direction: PublicServerSortDirection) {
  const directionClause = direction === "asc" ? sql`asc nulls last` : sql`desc nulls last`;
  const primaryEndpointEdition = sql`(
    select se.edition
    from server_endpoints se
    where se.server_id = ${servers.id}
      and se.verification_status = 'verified'
    order by case when se.edition = 'java' then 0 else 1 end
    limit 1
  )`;
  const primaryEndpointAddress = sql`(
    select se.host || ':' || se.port::text
    from server_endpoints se
    where se.server_id = ${servers.id}
      and se.verification_status = 'verified'
    order by case when se.edition = 'java' then 0 else 1 end
    limit 1
  )`;
  const reviewAverage = sql`(
    select avg(sr.rating)
    from server_reviews sr
    where sr.server_id = ${servers.id}
      and sr.status = 'published'
  )`;

  switch (sort) {
    case "name": return sql`${servers.name} ${directionClause}`;
    case "edition": return sql`${primaryEndpointEdition} ${directionClause}`;
    case "players": return sql`${servers.monitorPlayersCurrent} ${directionClause}`;
    case "version": return sql`${servers.monitorVersion} ${directionClause}`;
    case "latency": return sql`${servers.monitorLatencyMs} ${directionClause}`;
    case "rating": return sql`${reviewAverage} ${directionClause}`;
    case "ip": return sql`${primaryEndpointAddress} ${directionClause}`;
  }
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
        accessType: servers.accessType,
        accessFormUrl: servers.accessFormUrl,
        accountMode: servers.accountMode,
        authMode: servers.authMode,
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

export async function countPublishedServers(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(servers)
    .where(and(
      eq(servers.publicationStatus, "published"),
      eq(servers.moderationStatus, "active"),
      eq(servers.verificationStatus, "verified"),
      isNull(servers.availabilityHiddenAt),
      sql`exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.verification_status = 'verified')`,
    ));

  return row?.total ?? 0;
}

export async function getServerIdBySlug(slug: string) {
  const [row] = await db.select({ id: servers.id }).from(servers).where(eq(servers.slug, slug)).limit(1);
  return row?.id ?? null;
}

export function isMonitorDependentCatalogQuery({ status, sort, tableSort }: { status?: AggregateHealthStatus; sort: PublicServerSort; tableSort?: PublicServerTableSort }) {
  return Boolean(status || sort === "players" || tableSort === "players" || tableSort === "version" || tableSort === "latency");
}

async function hydratePublishedCatalogServers(ids: string[], edition?: "java" | "bedrock"): Promise<CatalogServer[]> {
  if (!ids.length) return [] as CatalogServer[];
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
        accessType: servers.accessType,
        accessFormUrl: servers.accessFormUrl,
        accountMode: servers.accountMode,
        authMode: servers.authMode,
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
      eq(servers.publicationStatus, "published"),
      eq(servers.moderationStatus, "active"),
      eq(servers.verificationStatus, "verified"),
      isNull(servers.availabilityHiddenAt),
      eq(serverEndpoints.verificationStatus, "verified"),
      edition ? eq(serverEndpoints.edition, edition) : undefined,
    ))
    .orderBy(desc(servers.createdAt), desc(servers.id), asc(serverEndpoints.edition));
  const rank = new Map(ids.map((id, index) => [id, index]));
  const ordered = groupServerRows(rows).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const catalog: CatalogServer[] = await attachReviewSummaries(await attachCatalogData(ordered));
  return catalog;
}

export type PublishedServerListArgs = {
  page?: number;
  query?: string;
  tagSlugs?: string[];
  edition?: "java" | "bedrock";
  status?: AggregateHealthStatus;
  sort?: PublicServerSort;
  tableSort?: PublicServerTableSort;
  tableDirection?: PublicServerSortDirection;
};

export async function listPublishedServersWithMonitor({
  page,
  query,
  tagSlugs,
  edition,
  status,
  sort,
  tableSort,
  tableDirection,
  monitorCache = "no-store",
}: {
  page: number;
  query: string;
  tagSlugs: string[];
  edition?: "java" | "bedrock";
  status?: AggregateHealthStatus;
  sort: PublicServerSort;
  tableSort?: PublicServerTableSort;
  tableDirection: PublicServerSortDirection;
  monitorCache?: RequestCache;
}) {
  const queryText = query.trim();
  const catalogOrder = tableSort && tableSort !== "players" && tableSort !== "version" && tableSort !== "latency"
    ? [tableSortOrder(tableSort, tableDirection)]
    : queryText
      ? [desc(sql`greatest(similarity(lower(${servers.name}), lower(${queryText.slice(0, 80)})) * 3, coalesce((select max(similarity(lower(t.slug), lower(${queryText.slice(0, 80)}))) * 2 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id}), 0), similarity(lower(coalesce(${servers.description}, '')), lower(${queryText.slice(0, 80)})))`)]
      : sort === "recent"
        ? [desc(servers.createdAt)]
        : [desc(sql`coalesce((select avg(sr.rating) from server_reviews sr where sr.server_id = ${servers.id} and sr.status = 'published'), 0)`)];
  const candidates = await db
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
    ))
    .orderBy(...catalogOrder, desc(servers.createdAt), desc(servers.id));
  const monitorSort = tableSort === "players" || sort === "players" ? "players" : tableSort === "latency" ? "latency" : tableSort === "version" ? "version" : "catalog";
  const result = await queryMonitorCatalog({
    candidateIds: candidates.map((candidate) => candidate.id),
    status,
    sort: monitorSort,
    direction: tableDirection,
    page,
    pageSize: PUBLIC_SERVER_PAGE_SIZE,
  }, { cache: monitorCache });
  if (!result) throw new Error("Monitor API is not configured for catalog queries.");
  const hydrated = await hydratePublishedCatalogServers(result.ids, edition);
  const statesById = new Map(result.states.map((state) => [state.serverId, state]));
  const monitored = hydrated.map((server) => monitorFromApi(server, statesById.get(server.id) ?? null));
  return { servers: monitored, hasNextPage: result.totalCount > page * PUBLIC_SERVER_PAGE_SIZE, totalCount: result.totalCount, page };
}

export async function listPublishedServersFromNeon({ page = 1, query = "", tagSlugs = [], edition, status, sort = "rating", tableSort, tableDirection = "asc" }: PublishedServerListArgs = {}): Promise<{ servers: CatalogServer[]; hasNextPage: boolean; totalCount: number; page: number }> {
  const safePage = Number.isSafeInteger(page) && page > 0
    ? Math.min(page, MAX_PUBLIC_SERVER_PAGE)
    : 1;
  const queryText = query.trim();
  const catalogOrder = tableSort
    ? [tableSortOrder(tableSort, tableDirection)]
    : queryText
      ? [desc(sql`greatest(similarity(lower(${servers.name}), lower(${queryText.slice(0, 80)})) * 3, coalesce((select max(similarity(lower(t.slug), lower(${queryText.slice(0, 80)}))) * 2 from server_tags st inner join tags t on t.id = st.tag_id where st.server_id = ${servers.id}), 0), similarity(lower(coalesce(${servers.description}, '')), lower(${queryText.slice(0, 80)})))`)]
      : sort === "players"
        ? [desc(sql`coalesce(${servers.monitorPlayersCurrent}, 0)`)]
        : sort === "recent"
          ? [desc(servers.createdAt)]
          : [desc(sql`coalesce((select avg(sr.rating) from server_reviews sr where sr.server_id = ${servers.id} and sr.status = 'published'), 0)`)];
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
    .orderBy(...catalogOrder, desc(servers.createdAt), desc(servers.id))
    .limit(PUBLIC_SERVER_PAGE_SIZE + 1)
    .offset((safePage - 1) * PUBLIC_SERVER_PAGE_SIZE);
  const hasNextPage = serverIds.length > PUBLIC_SERVER_PAGE_SIZE;
  const ids = serverIds.slice(0, PUBLIC_SERVER_PAGE_SIZE).map(({ id }) => id);
  if (ids.length === 0) {
    const emptyServers: CatalogServer[] = [];
    return { servers: emptyServers, hasNextPage: false, totalCount: 0, page: safePage };
  }

  const catalogServers = await hydratePublishedCatalogServers(ids, edition);
  return { servers: catalogServers, hasNextPage, totalCount: (safePage - 1) * PUBLIC_SERVER_PAGE_SIZE + ids.length + (hasNextPage ? 1 : 0), page: safePage };
}

export async function listPublishedServers({ page = 1, query = "", tagSlugs = [], edition, status, sort = "rating", tableSort, tableDirection = "asc" }: PublishedServerListArgs = {}): Promise<{ servers: CatalogServer[]; hasNextPage: boolean; totalCount: number; page: number }> {
  const safePage = Number.isSafeInteger(page) && page > 0
    ? Math.min(page, MAX_PUBLIC_SERVER_PAGE)
    : 1;
  if (isMonitorApiConfigured() && isMonitorDependentCatalogQuery({ status, sort, tableSort })) {
    return listPublishedServersWithMonitor({ page: safePage, query, tagSlugs, edition, status, sort, tableSort, tableDirection });
  }
  const result = await listPublishedServersFromNeon({ page: safePage, query, tagSlugs, edition, status, sort, tableSort, tableDirection });
  if (!isMonitorApiConfigured()) return result;
  return { ...result, servers: await attachMonitorApiStatuses(result.servers) };
}

export async function getPublishedServerCoreBySlug(slug: string) {
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
        accessType: servers.accessType,
        accessFormUrl: servers.accessFormUrl,
        accountMode: servers.accountMode,
        authMode: servers.authMode,
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

  const [catalog] = await attachCatalogData(groupServerRows(rows));
  if (!catalog) return null;
  return catalog;
}

export async function getPublishedServerBySlug(slug: string) {
  const server = await getPublishedServerCoreBySlug(slug);
  if (!server) return null;
  return (await attachMonitorApiStatuses([server]))[0] ?? null;
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
      accessType: servers.accessType,
      accessFormUrl: servers.accessFormUrl,
      accountMode: servers.accountMode,
      authMode: servers.authMode,
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
