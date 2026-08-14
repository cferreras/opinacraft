import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  serverEndpoints,
  serverMembers,
  serverMonitorScheduleHistory,
  serverPlayerHourly,
  serverPlayerSnapshots,
  servers,
} from "@/schema";
import { getMonitorCadenceMinutes, getMonitorFreshness, type MonitorFreshness } from "./monitor-scheduling";

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
  edition: "all";
  resolutionMinutes: number;
  cadenceMinutes: number | null;
  lastUpdatedAt: string | null;
  freshness: MonitorFreshness;
  probeEdition: HistoryEdition | null;
  generatedAt: string;
  series: HistorySeries[];
};

type HistoryWindow = {
  durationMs: number;
  resolutionMinutes: number;
  raw: boolean;
};

const windows: Record<HistoryPeriod, HistoryWindow> = {
  "24h": { durationMs: 24 * 60 * 60 * 1000, resolutionMinutes: 15, raw: true },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, resolutionMinutes: 60, raw: false },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, resolutionMinutes: 240, raw: false },
  "90d": { durationMs: 90 * 24 * 60 * 60 * 1000, resolutionMinutes: 720, raw: false },
};

const MONITOR_SAMPLE_INTERVAL_MINUTES = 15;

export function getExpectedSamplesPerPoint(resolutionMinutes: number, cadenceMinutes = MONITOR_SAMPLE_INTERVAL_MINUTES) {
  return Math.max(1, Math.round(resolutionMinutes / cadenceMinutes));
}

export type MonitorCadencePeriod = {
  cadenceMinutes: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export function getExpectedSamplesForSlot(
  slot: Date,
  resolutionMinutes: number,
  cadenceHistory: readonly MonitorCadencePeriod[],
  fallbackCadenceMinutes = MONITOR_SAMPLE_INTERVAL_MINUTES,
) {
  if (cadenceHistory.length === 0) return getExpectedSamplesPerPoint(resolutionMinutes, fallbackCadenceMinutes);

  const slotStart = slot.getTime();
  const slotEnd = slotStart + resolutionMinutes * 60_000;
  const periods = [...cadenceHistory].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  let cursor = slotStart;
  let expected = 0;

  for (const period of periods) {
    const periodStart = Math.max(slotStart, period.effectiveFrom.getTime());
    const periodEnd = Math.min(slotEnd, period.effectiveTo?.getTime() ?? slotEnd);
    if (periodEnd <= periodStart || periodEnd <= cursor) continue;

    if (periodStart > cursor) {
      expected += Math.ceil((periodStart - cursor) / (fallbackCadenceMinutes * 60_000));
    }

    const overlapStart = Math.max(periodStart, cursor);
    expected += Math.ceil((periodEnd - overlapStart) / (period.cadenceMinutes * 60_000));
    cursor = periodEnd;
    if (cursor >= slotEnd) break;
  }

  if (cursor < slotEnd) {
    expected += Math.ceil((slotEnd - cursor) / (fallbackCadenceMinutes * 60_000));
  }

  return Math.max(1, expected);
}

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
  normalizeEdition(editionValue);
  return { period, edition: "all" as const };
}

function emptyPoint(at: Date): HistoryPoint {
  return { at: at.toISOString(), averagePlayers: null, peakPlayers: null, capacity: null, averageOccupancyPct: null, responseRatePct: 0, monitorCoveragePct: 0, sampleCount: 0, status: "no_data", sourceChanged: false };
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

function buildSeriesFromBuckets(
  edition: "server",
  slots: Date[],
  buckets: Array<Array<BucketRow>>,
  expectedSamples: number | ((slot: Date) => number) = 1,
): HistorySeries {
  const points = slots.map((slot, index) => {
    const rows = buckets[index] ?? [];
    if (!rows.length) return emptyPoint(slot);
    const expectedSamplesPerPoint = typeof expectedSamples === "function" ? expectedSamples(slot) : expectedSamples;
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
    const status: HistoryPointStatus = onlineCount > 0 ? "online" : respondingCount >= sampleCount ? "offline" : "unknown";
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
    };
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
  const latestSample = buckets.flat().reduce<Date | null>((latest, row) => (!latest || row.sampledAt > latest ? row.sampledAt : latest), null);
  const totalSamples = populated.reduce((sum, point) => sum + point.sampleCount, 0);
  const totalResponding = populated.reduce((sum, point) => sum + (point.sampleCount * point.responseRatePct) / 100, 0);
  const expectedTotal = points.reduce((sum, point, index) => {
    const expectedForPoint = typeof expectedSamples === "function" ? expectedSamples(slots[index]!) : expectedSamples;
    return sum + Math.max(1, expectedForPoint);
  }, 0);

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
      monitorCoveragePct: expectedTotal ? round((totalSamples / expectedTotal) * 100) ?? 0 : 0,
      sampleCount: totalSamples,
      lastSampleAt: latestSample?.toISOString() ?? null,
      sourceChanges: points.filter((point) => point.sourceChanged).length,
    },
  };
}

function buildSlots(durationMs: number, resolutionMinutes: number, now: Date) {
  const resolutionMs = resolutionMinutes * 60_000;
  const end = alignToResolution(now, resolutionMs);
  const count = Math.min(180, Math.floor(durationMs / resolutionMs));
  const start = new Date(end.getTime() - (count - 1) * resolutionMs);
  return Array.from({ length: count }, (_, index) => new Date(start.getTime() + index * resolutionMs));
}

async function getMonitorMeta(serverId: string, now: Date) {
  const [[server], verifiedRows, cadenceHistory] = await Promise.all([
    db.select({
      publicationStatus: servers.publicationStatus,
      moderationStatus: servers.moderationStatus,
      availabilityHiddenAt: servers.availabilityHiddenAt,
      monitorLastCheckedAt: servers.monitorLastCheckedAt,
      monitorProbeEdition: servers.monitorProbeEdition,
    }).from(servers).where(eq(servers.id, serverId)).limit(1),
    db.select({ id: serverEndpoints.serverId }).from(serverEndpoints).where(and(eq(serverEndpoints.serverId, serverId), eq(serverEndpoints.verificationStatus, "verified"))).limit(1),
    db.select({
      cadenceMinutes: serverMonitorScheduleHistory.cadenceMinutes,
      effectiveFrom: serverMonitorScheduleHistory.effectiveFrom,
      effectiveTo: serverMonitorScheduleHistory.effectiveTo,
    }).from(serverMonitorScheduleHistory).where(eq(serverMonitorScheduleHistory.serverId, serverId)).orderBy(asc(serverMonitorScheduleHistory.effectiveFrom)),
  ]);
  const [verified] = verifiedRows;
  const cadenceMinutes = server ? getMonitorCadenceMinutes({
    publicationStatus: server.publicationStatus,
    moderationStatus: server.moderationStatus,
    availabilityHiddenAt: server.availabilityHiddenAt,
    hasVerifiedEndpoint: Boolean(verified),
  }) : null;
  return {
    cadenceMinutes,
    lastUpdatedAt: server?.monitorLastCheckedAt ?? null,
    freshness: cadenceMinutes ? getMonitorFreshness(server?.monitorLastCheckedAt ?? null, cadenceMinutes, now) : "never" as const,
    probeEdition: server?.monitorProbeEdition ?? null,
    cadenceHistory,
  };
}

export async function queryPlayerHistory(serverId: string, period: HistoryPeriod, editionFilter: HistoryEditionFilter = "all", now = new Date()): Promise<PlayerHistoryResponse> {
  void editionFilter;
  const baseWindow = windows[period];
  const meta = await getMonitorMeta(serverId, now);
  const resolutionMinutes = Math.max(baseWindow.resolutionMinutes, meta.cadenceMinutes ?? baseWindow.resolutionMinutes);
  const raw = baseWindow.raw && resolutionMinutes === 15;
  const slots = buildSlots(baseWindow.durationMs, resolutionMinutes, now);
  const resolutionMs = resolutionMinutes * 60_000;
  const first = slots[0] ?? alignToResolution(now, resolutionMs);
  const last = slots.at(-1) ?? first;
  const buckets = slots.map(() => [] as Array<BucketRow>);

  if (raw) {
    const rows = await db.select({
      status: serverPlayerSnapshots.status,
      playersCurrent: serverPlayerSnapshots.playersCurrent,
      playersMax: serverPlayerSnapshots.playersMax,
      scheduledAt: serverPlayerSnapshots.scheduledAt,
      observedAt: serverPlayerSnapshots.observedAt,
      probeEdition: serverPlayerSnapshots.probeEdition,
    }).from(serverPlayerSnapshots).where(and(eq(serverPlayerSnapshots.serverId, serverId), gte(serverPlayerSnapshots.scheduledAt, first), lte(serverPlayerSnapshots.scheduledAt, last))).orderBy(asc(serverPlayerSnapshots.scheduledAt));
    for (const row of rows) {
      const index = Math.floor((row.scheduledAt.getTime() - first.getTime()) / resolutionMs);
      if (index < 0 || index >= buckets.length) continue;
      buckets[index]!.push({ status: row.status, playersCurrent: row.playersCurrent, playersMax: row.playersMax, sampledAt: row.observedAt, historySourceId: row.probeEdition ?? "server", playersPeak: row.playersCurrent });
    }
  } else {
    const rows = await db.select({
      bucketStart: serverPlayerHourly.bucketStart,
      sampleCount: serverPlayerHourly.sampleCount,
      onlineCount: serverPlayerHourly.onlineCount,
      unknownCount: serverPlayerHourly.unknownCount,
      playerDataCount: serverPlayerHourly.playerDataCount,
      playersTotal: serverPlayerHourly.playersTotal,
      playersPeak: serverPlayerHourly.playersPeak,
      capacityDataCount: serverPlayerHourly.capacityDataCount,
      capacityTotal: serverPlayerHourly.capacityTotal,
      capacityLatest: serverPlayerHourly.capacityLatest,
      occupancyDataCount: serverPlayerHourly.occupancyDataCount,
      occupancyBasisPointsTotal: serverPlayerHourly.occupancyBasisPointsTotal,
      lastObservedAt: serverPlayerHourly.lastObservedAt,
      lastProbeEdition: serverPlayerHourly.lastProbeEdition,
      sourceChanged: serverPlayerHourly.sourceChanged,
    }).from(serverPlayerHourly).where(and(eq(serverPlayerHourly.serverId, serverId), gte(serverPlayerHourly.bucketStart, new Date(first.getTime() - resolutionMs)), lte(serverPlayerHourly.bucketStart, last))).orderBy(asc(serverPlayerHourly.bucketStart));
    for (const row of rows) {
      const index = Math.floor((row.bucketStart.getTime() - first.getTime()) / resolutionMs);
      if (index < 0 || index >= buckets.length) continue;
      const online = row.onlineCount > 0;
      const unknown = row.unknownCount > 0 && row.onlineCount === 0 && row.onlineCount + row.unknownCount === row.sampleCount;
      buckets[index]!.push({
        status: online ? "online" : unknown ? "unknown" : "offline",
        playersCurrent: row.playerDataCount ? row.playersTotal / row.playerDataCount : null,
        playersMax: row.capacityDataCount ? row.capacityTotal / row.capacityDataCount : null,
        sampledAt: row.lastObservedAt ?? row.bucketStart,
        historySourceId: row.lastProbeEdition ?? "server",
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
  }

  const series = buildSeriesFromBuckets(
    "server",
    slots,
    buckets,
    (slot) => getExpectedSamplesForSlot(slot, resolutionMinutes, meta.cadenceHistory, meta.cadenceMinutes ?? MONITOR_SAMPLE_INTERVAL_MINUTES),
  );
  return { period, edition: "all", resolutionMinutes, cadenceMinutes: meta.cadenceMinutes, lastUpdatedAt: meta.lastUpdatedAt?.toISOString() ?? null, freshness: meta.freshness, probeEdition: meta.probeEdition, generatedAt: now.toISOString(), series: [series] };
}

async function publicServerExists(serverId: string) {
  const [row] = await db.select({ id: servers.id }).from(servers).innerJoin(serverEndpoints, eq(serverEndpoints.serverId, servers.id)).where(and(eq(servers.id, serverId), eq(servers.publicationStatus, "published"), eq(servers.moderationStatus, "active"), eq(servers.verificationStatus, "verified"), isNull(servers.availabilityHiddenAt), eq(serverEndpoints.verificationStatus, "verified"))).limit(1);
  return Boolean(row);
}

export async function getPublicPlayerHistory(serverId: string, period: HistoryPeriod, edition: HistoryEditionFilter = "all", now = new Date()) {
  if (!(await publicServerExists(serverId))) return null;
  return queryPlayerHistory(serverId, period, edition, now);
}

export async function getManagedPlayerHistory(serverId: string, userId: string, period: HistoryPeriod, edition: HistoryEditionFilter = "all", now = new Date()) {
  const [member] = await db.select({ serverId: serverMembers.serverId }).from(serverMembers).where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId))).limit(1);
  if (!member) return null;
  return queryPlayerHistory(serverId, period, edition, now);
}
