import type { HistoryPeriod, HistoryPoint, HistoryPointStatus, HistorySeries } from "./player-history";

const availabilityLegend: ReadonlyArray<{ status: HistoryPointStatus; label: string }> = [
  { status: "online", label: "En línea" },
  { status: "offline", label: "Sin respuesta" },
  { status: "unknown", label: "Sin comprobar" },
  { status: "no_data", label: "Sin histórico" },
];

export function getAvailabilityLegend() {
  return availabilityLegend.map((entry) => ({ ...entry }));
}

export type PlayerHistoryChartPoint = HistoryPoint & {
  serverPeak?: number | null;
  javaPeak?: number | null;
  bedrockPeak?: number | null;
};

export function getPlayerHistoryChartTickMode(period: HistoryPeriod): "time" | "date" {
  return period === "24h" ? "time" : "date";
}

export function mergeHistoryChartData(seriesList: HistorySeries[]): PlayerHistoryChartPoint[] {
  const byAt = new Map<string, PlayerHistoryChartPoint>();
  for (const series of seriesList) {
    for (const point of series.points) {
      const existing = byAt.get(point.at) ?? { ...point };
      if (series.edition === "server") existing.serverPeak = point.peakPlayers;
      else if (series.edition === "java") existing.javaPeak = point.peakPlayers;
      else existing.bedrockPeak = point.peakPlayers;
      existing.status = existing.status === "online" || point.status === "online" ? "online" : existing.status === "offline" || point.status === "offline" ? "offline" : point.status;
      existing.sampleCount = Math.max(existing.sampleCount ?? 0, point.sampleCount);
      existing.sourceChanged = existing.sourceChanged || point.sourceChanged;
      byAt.set(point.at, existing);
    }
  }
  return [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export function trimTrailingEmptyChartPoints(points: PlayerHistoryChartPoint[]) {
  const lastObservedIndex = points.findLastIndex((point) =>
    point.serverPeak !== null && point.serverPeak !== undefined
    || point.javaPeak !== null && point.javaPeak !== undefined
    || point.bedrockPeak !== null && point.bedrockPeak !== undefined,
  );
  return lastObservedIndex < 0 ? points : points.slice(0, lastObservedIndex + 1);
}

export function getPlayerHistoryChartTicks(
  points: ReadonlyArray<Pick<PlayerHistoryChartPoint, "at">>,
  maximumIntervals = 8,
  getTickKey?: (point: Pick<PlayerHistoryChartPoint, "at">) => string,
) {
  let candidatePoints = points;
  if (points.length > maximumIntervals + 1) {
    const step = Math.ceil((points.length - 1) / maximumIntervals);
    const ticks = points.filter((_, index) => index % step === 0);
    const last = points.at(-1);
    if (last && ticks.at(-1) !== last) ticks.push(last);
    candidatePoints = ticks;
  }

  if (!getTickKey) return candidatePoints.map((point) => point.at);

  const seen = new Set<string>();
  return [...candidatePoints].reverse().filter((point) => {
    const key = getTickKey(point);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).reverse().map((point) => point.at);
}
