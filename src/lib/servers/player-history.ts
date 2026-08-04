import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { serverEndpointPlayerHourly, serverEndpointPlayerSnapshots, serverEndpoints, serverMembers, servers } from "@/schema";

export const historyPeriods = ["24h", "7d", "30d", "90d"] as const;
export const historyEditionFilters = ["all", "java", "bedrock"] as const;
export type HistoryPeriod = (typeof historyPeriods)[number];
export type HistoryEditionFilter = (typeof historyEditionFilters)[number];
export type HistoryEdition = "java" | "bedrock";
export type HistoryPointStatus = "online" | "offline" | "unknown" | "no_data";

export type HistoryPoint = {
  at: string;
  averagePlayers: number | null;
  peakPlayers: number | null;
  capacity: number | null;
  averageOccupancyPct: number | null;
  responseRatePct: number;
  monitorCoveragePct: number;
  sampleCount: number;
  status: HistoryPointStatus;
  sourceChanged: boolean;
};

export type HistorySeries = {
  edition: HistoryEdition | "server";
  points: HistoryPoint[];
  summary: {
    currentPlayers: number | null;
    currentCapacity: number | null;
    currentStatus: HistoryPointStatus;
    averagePlayers: number | null;
    peakPlayers: number | null;
    averageOccupancyPct: number | null;
    responseRatePct: number;
    monitorCoveragePct: number;
    sampleCount: number;
    lastSampleAt: string | null;
    sourceChanges: number;
  };
};

export type PlayerHistoryResponse = {
  period: HistoryPeriod;
  edition: HistoryEditionFilter;
  resolutionMinutes: number;
  generatedAt: string;
  series: HistorySeries[];
};

type HistoryWindow = {
  durationMs: number;
  resolutionMs: number;
  resolutionMinutes: number;
  raw: boolean;
};

const windows: Record<HistoryPeriod, HistoryWindow> = {
  "24h": { durationMs: 24 * 60 * 60 * 1000, resolutionMs: 15 * 60 * 1000, resolutionMinutes: 15, raw: true },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, resolutionMs: 60 * 60 * 1000, resolutionMinutes: 60, raw: false },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, resolutionMs: 4 * 60 * 60 * 1000, resolutionMinutes: 240, raw: false },
  "90d": { durationMs: 90 * 24 * 60 * 60 * 1000, resolutionMs: 12 * 60 * 60 * 1000, resolutionMinutes: 720, raw: false },
};

function alignToResolution(value: Date, resolutionMs: number) {
  return new Date(Math.floor(value.getTime() / resolutionMs) * resolutionMs);
}

function normalizePeriod(value: string | null | undefined): HistoryPeriod | null {
  return historyPeriods.includes(value as HistoryPeriod) ? value as HistoryPeriod : null;
}

function normalizeEdition(value: string | null | undefined): HistoryEditionFilter | null {
  return historyEditionFilters.includes(value as HistoryEditionFilter) ? value as HistoryEditionFilter : null;
}

export function parseHistoryParams(periodValue?: string | null, editionValue?: string | null) {
  const period = normalizePeriod(periodValue) ?? "24h";
  const edition = normalizeEdition(editionValue) ?? "all";
  return { period, edition };
}

function emptyPoint(at: Date): HistoryPoint {
  return {
    at: at.toISOString(),
    averagePlayers: null,
    peakPlayers: null,
    capacity: null,
    averageOccupancyPct: null,
    responseRatePct: 0,
    monitorCoveragePct: 0,
    sampleCount: 0,
    status: "no_data",
    sourceChanged: false,
  };
}

function round(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type BucketRow = {
  status: "unknown" | "online" | "offline";
  playersCurrent: number | null;
  playersMax: number | null;
  sampledAt: Date;
  historySourceId: string;
  sourceChanged?: boolean;
  sampleCount?: number;
  responseCount?: number;
  onlineCount?: number;
  playerDataCount?: number;
  playersTotal?: number;
  playersPeak?: number | null;
  capacityDataCount?: number;
  capacityTotal?: number;
  occupancyDataCount?: number;
  occupancyBasisPointsTotal?: number;
};

function buildSeriesFromBuckets(edition: HistoryEdition, slots: Date[], buckets: Array<Array<BucketRow>>, expectedSamplesPerPoint = 1) {
  const points = slots.map((slot, index) => {
    const rows = buckets[index] ?? [];
    if (!rows.length) return emptyPoint(slot);
    const sampleCount = rows.reduce((sum, row) => sum + (row.sampleCount ?? 1), 0);
    const onlineCount = rows.reduce((sum, row) => sum + (row.onlineCount ?? (row.status === "online" ? row.sampleCount ?? 1 : 0)), 0);
    const respondingCount = rows.reduce((sum, row) => sum + (row.responseCount ?? (row.status === "unknown" ? 0 : row.sampleCount ?? 1)), 0);
    const playerDataCount = rows.reduce((sum, row) => sum + (row.playerDataCount ?? (row.playersCurrent === null ? 0 : row.sampleCount ?? 1)), 0);
    const playersTotal = rows.reduce((sum, row) => sum + (row.playersTotal ?? (row.playersCurrent ?? 0) * (row.sampleCount ?? 1)), 0);
    const capacityDataCount = rows.reduce((sum, row) => sum + (row.capacityDataCount ?? (row.playersMax === null ? 0 : row.sampleCount ?? 1)), 0);
    const capacityTotal = rows.reduce((sum, row) => sum + (row.capacityTotal ?? (row.playersMax ?? 0) * (row.sampleCount ?? 1)), 0);
    const occupancyDataCount = rows.reduce((sum, row) => sum + (row.occupancyDataCount ?? (row.playersCurrent !== null && row.playersMax !== null && row.playersMax > 0 ? row.sampleCount ?? 1 : 0)), 0);
    const occupancyBasisPointsTotal = rows.reduce((sum, row) => sum + (row.occupancyBasisPointsTotal ?? (row.playersCurrent !== null && row.playersMax !== null && row.playersMax > 0 ? ((row.playersCurrent / row.playersMax) * 10_000) * (row.sampleCount ?? 1) : 0)), 0);
    const peakValues = rows.flatMap((row) => row.playersPeak === null || row.playersPeak === undefined ? [] : [row.playersPeak]);
    const sourceIds = new Set(rows.map((row) => row.historySourceId));
    const status = onlineCount > 0
      ? "online"
      : respondingCount >= sampleCount
        ? "offline"
        : "unknown";
    return {
      at: slot.toISOString(),
      averagePlayers: playerDataCount ? round(playersTotal / playerDataCount) : null,
      peakPlayers: peakValues.length ? Math.max(...peakValues) : null,
      capacity: capacityDataCount ? round(capacityTotal / capacityDataCount) : null,
      averageOccupancyPct: occupancyDataCount ? round((occupancyBasisPointsTotal / occupancyDataCount) / 100) : null,
      responseRatePct: round((respondingCount / sampleCount) * 100) ?? 0,
      monitorCoveragePct: Math.min(100, Math.round((sampleCount / expectedSamplesPerPoint) * 100)),
      sampleCount,
      status,
      sourceChanged: sourceIds.size > 1 || rows.some((row) => row.sourceChanged),
    } satisfies HistoryPoint;
  });

  let previousSource: string | null = null;
  buckets.forEach((rows, index) => {
    const source = rows.at(-1)?.historySourceId ?? null;
    if (source && previousSource && source !== previousSource && points[index]) points[index]!.sourceChanged = true;
    if (source) previousSource = source;
  });

  const populated = points.filter((point) => point.sampleCount > 0);
  const playerPoints = populated.filter((point) => point.averagePlayers !== null);
  const occupancyPoints = populated.filter((point) => point.averageOccupancyPct !== null);
  const lastPoint = [...populated].reverse()[0] ?? null;
  const lastSample = lastPoint?.at ?? null;
  const sourceChanges = points.filter((point) => point.sourceChanged).length;
  const expectedSlots = points.length;
  const totalSamples = populated.reduce((sum, point) => sum + point.sampleCount, 0);
  const totalResponding = populated.reduce((sum, point) => sum + (point.sampleCount * point.responseRatePct) / 100, 0);

  return {
    edition,
    points,
    summary: {
      currentPlayers: lastPoint?.averagePlayers ?? null,
      currentCapacity: lastPoint?.capacity ?? null,
      currentStatus: lastPoint?.status ?? "no_data",
      averagePlayers: playerPoints.length ? round(playerPoints.reduce((sum, point) => sum + (point.averagePlayers ?? 0), 0) / playerPoints.length) : null,
      peakPlayers: playerPoints.length ? Math.max(...playerPoints.map((point) => point.peakPlayers ?? 0)) : null,
      averageOccupancyPct: occupancyPoints.length ? round(occupancyPoints.reduce((sum, point) => sum + (point.averageOccupancyPct ?? 0), 0) / occupancyPoints.length) : null,
      responseRatePct: totalSamples ? round((totalResponding / totalSamples) * 100) ?? 0 : 0,
      monitorCoveragePct: expectedSlots && expectedSamplesPerPoint ? round((totalSamples / (expectedSlots * expectedSamplesPerPoint)) * 100) ?? 0 : 0,
      sampleCount: totalSamples,
      lastSampleAt: lastSample,
      sourceChanges,
    },
  } satisfies HistorySeries;
}

function buildSlots(window: HistoryWindow, now = new Date()) {
  const end = alignToResolution(now, window.resolutionMs);
  const count = Math.min(180, Math.floor(window.durationMs / window.resolutionMs));
  const start = new Date(end.getTime() - (count - 1) * window.resolutionMs);
  return Array.from({ length: count }, (_, index) => new Date(start.getTime() + index * window.resolutionMs));
}

export async function queryPlayerHistory(serverId: string, period: HistoryPeriod, editionFilter: HistoryEditionFilter, now = new Date()): Promise<PlayerHistoryResponse> {
  const window = windows[period];
  const slots = buildSlots(window, now);
  const first = slots[0] ?? alignToResolution(now, window.resolutionMs);
  const last = slots.at(-1) ?? first;
  const editions: HistoryEdition[] = editionFilter === "all" ? ["java", "bedrock"] : [editionFilter];
  const serverEndpointsRows = await db
    .select({ edition: serverEndpoints.edition })
    .from(serverEndpoints)
    .where(and(eq(serverEndpoints.serverId, serverId), eq(serverEndpoints.verificationStatus, "verified")));
  const availableEditions = new Set(serverEndpointsRows.map((row) => row.edition));

  if (window.raw) {
    const rows = await db
      .select({
        edition: serverEndpointPlayerSnapshots.edition,
        status: serverEndpointPlayerSnapshots.status,
        playersCurrent: serverEndpointPlayerSnapshots.playersCurrent,
        playersMax: serverEndpointPlayerSnapshots.playersMax,
        sampledAt: serverEndpointPlayerSnapshots.sampledAt,
        historySourceId: serverEndpointPlayerSnapshots.historySourceId,
      })
      .from(serverEndpointPlayerSnapshots)
      .where(and(eq(serverEndpointPlayerSnapshots.serverId, serverId), inArray(serverEndpointPlayerSnapshots.edition, editions), gte(serverEndpointPlayerSnapshots.sampledAt, first), lte(serverEndpointPlayerSnapshots.sampledAt, last)))
      .orderBy(asc(serverEndpointPlayerSnapshots.sampledAt));
    const byEdition = new Map<HistoryEdition, typeof rows>();
    for (const row of rows) byEdition.set(row.edition, [...(byEdition.get(row.edition) ?? []), row]);
    const series = editions.filter((item) => availableEditions.has(item)).map((item) => {
      const buckets = slots.map(() => [] as Array<BucketRow>);
      for (const row of byEdition.get(item) ?? []) {
        const index = Math.floor((row.sampledAt.getTime() - first.getTime()) / window.resolutionMs);
        if (index >= 0 && index < buckets.length) {
          buckets[index]!.push({
            status: row.status,
            playersCurrent: row.playersCurrent,
            playersMax: row.playersMax,
            sampledAt: row.sampledAt,
            historySourceId: row.historySourceId,
            playersPeak: row.playersCurrent,
          });
        }
      }
      return buildSeriesFromBuckets(item, slots, buckets);
    });
    return { period, edition: editionFilter, resolutionMinutes: window.resolutionMinutes, generatedAt: now.toISOString(), series };
  }

  const rows = await db
    .select({
      edition: serverEndpointPlayerHourly.edition,
      bucketStart: serverEndpointPlayerHourly.bucketStart,
      sampleCount: serverEndpointPlayerHourly.sampleCount,
      onlineCount: serverEndpointPlayerHourly.onlineCount,
      unknownCount: serverEndpointPlayerHourly.unknownCount,
      playerDataCount: serverEndpointPlayerHourly.playerDataCount,
      playersTotal: serverEndpointPlayerHourly.playersTotal,
      playersPeak: serverEndpointPlayerHourly.playersPeak,
      capacityDataCount: serverEndpointPlayerHourly.capacityDataCount,
      capacityTotal: serverEndpointPlayerHourly.capacityTotal,
      capacityLatest: serverEndpointPlayerHourly.capacityLatest,
      occupancyDataCount: serverEndpointPlayerHourly.occupancyDataCount,
      occupancyBasisPointsTotal: serverEndpointPlayerHourly.occupancyBasisPointsTotal,
      lastSampleAt: serverEndpointPlayerHourly.lastSampleAt,
      lastSourceId: serverEndpointPlayerHourly.lastSourceId,
      sourceChanged: serverEndpointPlayerHourly.sourceChanged,
    })
    .from(serverEndpointPlayerHourly)
    .where(and(eq(serverEndpointPlayerHourly.serverId, serverId), inArray(serverEndpointPlayerHourly.edition, editions), gte(serverEndpointPlayerHourly.bucketStart, new Date(first.getTime() - window.resolutionMs)), lte(serverEndpointPlayerHourly.bucketStart, last)))
    .orderBy(asc(serverEndpointPlayerHourly.bucketStart));
  const series = editions.filter((item) => availableEditions.has(item)).map((item) => {
    const buckets = slots.map(() => [] as Array<BucketRow>);
    for (const row of rows.filter((value) => value.edition === item)) {
      const index = Math.floor((row.bucketStart.getTime() - first.getTime()) / window.resolutionMs);
      if (index < 0 || index >= buckets.length) continue;
      const online = row.onlineCount > 0;
      const unknown = row.unknownCount > 0 && row.onlineCount === 0 && row.onlineCount + row.unknownCount === row.sampleCount;
      buckets[index]!.push({
        status: online ? "online" : unknown ? "unknown" : "offline",
        playersCurrent: row.playerDataCount ? row.playersTotal / row.playerDataCount : null,
        playersMax: row.capacityDataCount ? row.capacityTotal / row.capacityDataCount : null,
        sampledAt: row.lastSampleAt ?? row.bucketStart,
        historySourceId: row.lastSourceId ?? "",
        sourceChanged: row.sourceChanged === 1,
        sampleCount: row.sampleCount,
        responseCount: row.sampleCount - row.unknownCount,
        onlineCount: row.onlineCount,
        playerDataCount: row.playerDataCount,
        playersTotal: row.playersTotal,
        playersPeak: row.playersPeak,
        capacityDataCount: row.capacityDataCount,
        capacityTotal: row.capacityTotal,
        occupancyDataCount: row.occupancyDataCount,
        occupancyBasisPointsTotal: row.occupancyBasisPointsTotal,
      });
    }
    return buildSeriesFromBuckets(item, slots, buckets, window.resolutionMs / (60 * 60 * 1000));
  });
  return { period, edition: editionFilter, resolutionMinutes: window.resolutionMinutes, generatedAt: now.toISOString(), series };
}

async function publicServerExists(serverId: string) {
  const [row] = await db
    .select({ id: servers.id })
    .from(servers)
    .innerJoin(serverEndpoints, eq(serverEndpoints.serverId, servers.id))
    .where(and(eq(servers.id, serverId), eq(servers.publicationStatus, "published"), eq(servers.moderationStatus, "active"), eq(servers.verificationStatus, "verified"), isNull(servers.availabilityHiddenAt), eq(serverEndpoints.verificationStatus, "verified")));
  return Boolean(row);
}

export async function getPublicPlayerHistory(serverId: string, period: HistoryPeriod, edition: HistoryEditionFilter, now = new Date()) {
  if (!(await publicServerExists(serverId))) return null;
  return queryPlayerHistory(serverId, period, edition, now);
}

export async function getManagedPlayerHistory(serverId: string, userId: string, period: HistoryPeriod, edition: HistoryEditionFilter, now = new Date()) {
  const [member] = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);
  if (!member) return null;
  return queryPlayerHistory(serverId, period, edition, now);
}
