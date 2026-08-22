import type { HistoryPoint, HistoryPointStatus, HistorySeries } from "./player-history";

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
