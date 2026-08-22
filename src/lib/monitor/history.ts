import { getMonitorFreshness, PUBLIC_MONITOR_CADENCE_MINUTES, type MonitorFreshness } from "@/lib/servers/monitor-scheduling";

export const historyPeriods = ["24h", "7d", "30d", "90d"] as const;
export type HistoryPeriod = (typeof historyPeriods)[number];
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

type HistoryWindow = { durationMs: number; resolutionMinutes: number; raw: boolean };

const windows: Record<HistoryPeriod, HistoryWindow> = {
  "24h": { durationMs: 24 * 60 * 60 * 1000, resolutionMinutes: 15, raw: true },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, resolutionMinutes: 60, raw: false },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, resolutionMinutes: 240, raw: false },
  "90d": { durationMs: 90 * 24 * 60 * 60 * 1000, resolutionMinutes: 720, raw: false },
};

export type MonitorCadencePeriod = {
  cadenceMinutes: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export function getExpectedSamplesPerPoint(resolutionMinutes: number, cadenceMinutes = PUBLIC_MONITOR_CADENCE_MINUTES) {
  return Math.max(1, Math.round(resolutionMinutes / cadenceMinutes));
}

export function getExpectedSamplesForSlot(
  slot: Date,
  resolutionMinutes: number,
  cadenceHistory: readonly MonitorCadencePeriod[],
  fallbackCadenceMinutes = PUBLIC_MONITOR_CADENCE_MINUTES,
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
    if (periodStart > cursor) expected += Math.ceil((periodStart - cursor) / (fallbackCadenceMinutes * 60_000));
    const overlapStart = Math.max(periodStart, cursor);
    expected += Math.ceil((periodEnd - overlapStart) / (period.cadenceMinutes * 60_000));
    cursor = periodEnd;
    if (cursor >= slotEnd) break;
  }

  if (cursor < slotEnd) expected += Math.ceil((slotEnd - cursor) / (fallbackCadenceMinutes * 60_000));
  return Math.max(1, expected);
}

export type MonitorHistoryRawRow = {
  scheduled_at?: Date | string;
  observed_at?: Date | string;
  probe_edition?: HistoryEdition | null;
  status?: "unknown" | "online" | "offline";
  players_current?: number | string | null;
  players_max?: number | string | null;
  bucket_start?: Date | string;
  last_probe_edition?: HistoryEdition | null;
  source_changed?: number | boolean;
  sample_count?: number | string;
  online_count?: number | string;
  unknown_count?: number | string;
  player_data_count?: number | string;
  players_total?: number | string;
  players_peak?: number | string | null;
  capacity_data_count?: number | string;
  capacity_total?: number | string;
  capacity_latest?: number | string | null;
  occupancy_data_count?: number | string;
  occupancy_basis_points_total?: number | string;
  last_observed_at?: Date | string | null;
};

function asDate(value: Date | string | undefined | null) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asNumber(value: number | string | undefined | null) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function alignToResolution(value: Date, resolutionMs: number) {
  return new Date(Math.floor(value.getTime() / resolutionMs) * resolutionMs);
}

function buildSlots(durationMs: number, resolutionMinutes: number, now: Date, includeCurrentInterval: boolean) {
  const resolutionMs = resolutionMinutes * 60_000;
  const currentInterval = alignToResolution(now, resolutionMs);
  const end = includeCurrentInterval ? currentInterval : new Date(currentInterval.getTime() - resolutionMs);
  const count = Math.min(180, Math.floor(durationMs / resolutionMs));
  const start = new Date(end.getTime() - (count - 1) * resolutionMs);
  return Array.from({ length: count }, (_, index) => new Date(start.getTime() + index * resolutionMs));
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
    edition: "server",
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

export function buildMonitorHistory({
  period,
  now,
  cadenceMinutes,
  lastUpdatedAt,
  freshness,
  probeEdition,
  rows,
}: {
  period: HistoryPeriod;
  now: Date;
  cadenceMinutes: number | null;
  lastUpdatedAt: Date | null;
  freshness?: MonitorFreshness;
  probeEdition: HistoryEdition | null;
  rows: { raw: boolean; rows: MonitorHistoryRawRow[] };
}): PlayerHistoryResponse {
  const baseWindow = windows[period];
  const resolutionMinutes = Math.max(baseWindow.resolutionMinutes, cadenceMinutes ?? baseWindow.resolutionMinutes);
  const raw = baseWindow.raw && resolutionMinutes === 15 && rows.raw;
  const resolutionMs = resolutionMinutes * 60_000;
  const currentInterval = alignToResolution(now, resolutionMs);
  const includeCurrentInterval = raw || rows.rows.some((row) => {
    const at = raw ? asDate(row.scheduled_at) : asDate(row.bucket_start);
    if (!at || at < currentInterval || at.getTime() >= currentInterval.getTime() + resolutionMs) return false;
    return raw || (asNumber(row.sample_count) ?? 0) > 0;
  });
  const slots = buildSlots(baseWindow.durationMs, resolutionMinutes, now, includeCurrentInterval);
  const first = slots[0] ?? alignToResolution(now, resolutionMs);
  const buckets = slots.map(() => [] as Array<BucketRow>);
  const cadenceHistory: MonitorCadencePeriod[] = cadenceMinutes
    ? [{ cadenceMinutes, effectiveFrom: new Date(now.getTime() - baseWindow.durationMs), effectiveTo: null }]
    : [];

  for (const row of rows.rows) {
    const at = raw ? asDate(row.scheduled_at) : asDate(row.bucket_start);
    if (!at) continue;
    const index = Math.floor((at.getTime() - first.getTime()) / resolutionMs);
    if (index < 0 || index >= buckets.length) continue;
    if (raw) {
      const sampledAt = asDate(row.observed_at) ?? at;
      buckets[index]!.push({
        status: row.status ?? "unknown",
        playersCurrent: asNumber(row.players_current),
        playersMax: asNumber(row.players_max),
        sampledAt,
        historySourceId: row.probe_edition ?? "server",
        playersPeak: asNumber(row.players_current),
      });
      continue;
    }
    const sampleCount = asNumber(row.sample_count) ?? 0;
    const onlineCount = asNumber(row.online_count) ?? 0;
    const unknownCount = asNumber(row.unknown_count) ?? 0;
    const playerDataCount = asNumber(row.player_data_count) ?? 0;
    const playersTotal = asNumber(row.players_total) ?? 0;
    const capacityDataCount = asNumber(row.capacity_data_count) ?? 0;
    const capacityTotal = asNumber(row.capacity_total) ?? 0;
    const playersCurrent = playerDataCount ? playersTotal / playerDataCount : null;
    const playersMax = capacityDataCount ? capacityTotal / capacityDataCount : null;
    buckets[index]!.push({
      status: onlineCount > 0 ? "online" : unknownCount > 0 && onlineCount + unknownCount === sampleCount ? "unknown" : "offline",
      playersCurrent,
      playersMax,
      sampledAt: asDate(row.last_observed_at) ?? at,
      historySourceId: row.last_probe_edition ?? "server",
      sourceChanged: Boolean(row.source_changed),
      sampleCount,
      responseCount: sampleCount - unknownCount,
      onlineCount,
      playerDataCount,
      playersTotal,
      playersPeak: asNumber(row.players_peak),
      capacityDataCount,
      capacityTotal,
      occupancyDataCount: asNumber(row.occupancy_data_count) ?? 0,
      occupancyBasisPointsTotal: asNumber(row.occupancy_basis_points_total) ?? 0,
    });
  }

  const series = buildSeriesFromBuckets(
    slots,
    buckets,
    (slot) => getExpectedSamplesForSlot(slot, resolutionMinutes, cadenceHistory, cadenceMinutes ?? PUBLIC_MONITOR_CADENCE_MINUTES),
  );
  const resolvedFreshness = freshness ?? (cadenceMinutes ? getMonitorFreshness(lastUpdatedAt, cadenceMinutes, now) : "never");
  const currentPoint = series.points.at(-1);
  const previousStatus = [...series.points.slice(0, -1)]
    .reverse()
    .find((point) => point.sampleCount > 0)?.status;
  const availabilitySeries = raw
    && resolvedFreshness === "fresh"
    && currentPoint?.sampleCount === 0
    && previousStatus
    && previousStatus !== "no_data"
    ? {
        ...series,
        points: [
          ...series.points.slice(0, -1),
          { ...currentPoint, status: previousStatus },
        ],
      }
    : series;
  return {
    period,
    edition: "all",
    resolutionMinutes,
    cadenceMinutes,
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    freshness: resolvedFreshness,
    probeEdition,
    generatedAt: now.toISOString(),
    series: [availabilitySeries],
  };
}
