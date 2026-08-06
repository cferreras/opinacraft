import type { HistoryPoint, HistoryPointStatus, HistorySeries } from "./player-history";

function emptyPoint(at: string): HistoryPoint {
  return {
    at,
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

/**
 * Creates the public server view without summing edition endpoints. Java and
 * Bedrock probes can expose the same network population (for example through
 * a cross-play proxy), so the safest aggregate is the highest observation at
 * each point. The raw series remain available through the edition filters.
 */
export function aggregateHistorySeries(series: HistorySeries[]): HistorySeries | null {
  if (!series.length) return null;

  const pointCount = Math.max(...series.map((item) => item.points.length), 0);
  const points = Array.from({ length: pointCount }, (_, index) => {
    const sourcePoints = series.map((item) => item.points[index]).filter((point): point is HistoryPoint => Boolean(point));
    if (!sourcePoints.length) return emptyPoint("");

    const playerValues = sourcePoints.flatMap((point) => point.averagePlayers === null ? [] : [point.averagePlayers]);
    const peakValues = sourcePoints.flatMap((point) => point.peakPlayers === null ? [] : [point.peakPlayers]);
    const capacityValues = sourcePoints.flatMap((point) => point.capacity === null ? [] : [point.capacity]);
    const occupancyValues = sourcePoints.flatMap((point) => point.averageOccupancyPct === null ? [] : [point.averageOccupancyPct]);
    const statuses = new Set(sourcePoints.map((point) => point.status));
    const status: HistoryPointStatus = statuses.has("online")
      ? "online"
      : statuses.has("unknown")
        ? "unknown"
        : statuses.has("offline") && !statuses.has("no_data")
          ? "offline"
          : "no_data";

    return {
      at: sourcePoints[0]!.at,
      averagePlayers: playerValues.length ? Math.max(...playerValues) : null,
      peakPlayers: peakValues.length ? Math.max(...peakValues) : null,
      capacity: capacityValues.length ? Math.max(...capacityValues) : null,
      averageOccupancyPct: occupancyValues.length ? Math.max(...occupancyValues) : null,
      responseRatePct: Math.max(...sourcePoints.map((point) => point.responseRatePct)),
      monitorCoveragePct: Math.max(...sourcePoints.map((point) => point.monitorCoveragePct)),
      sampleCount: Math.max(...sourcePoints.map((point) => point.sampleCount)),
      status,
      sourceChanged: sourcePoints.some((point) => point.sourceChanged),
    } satisfies HistoryPoint;
  });

  const populated = points.filter((point) => point.sampleCount > 0);
  const playerPoints = populated.filter((point) => point.averagePlayers !== null);
  const occupancyPoints = populated.filter((point) => point.averageOccupancyPct !== null);
  const lastPoint = [...populated].reverse()[0] ?? null;
  const lastSampleAt = series
    .map((item) => item.summary.lastSampleAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const totalSamples = populated.reduce((sum, point) => sum + point.sampleCount, 0);
  const totalResponding = populated.reduce((sum, point) => sum + (point.sampleCount * point.responseRatePct) / 100, 0);
  const coverage = populated.length ? populated.reduce((sum, point) => sum + point.monitorCoveragePct, 0) / populated.length : 0;

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
      monitorCoveragePct: round(coverage) ?? 0,
      sampleCount: totalSamples,
      lastSampleAt,
      sourceChanges: points.filter((point) => point.sourceChanged).length,
    },
  } satisfies HistorySeries;
}
