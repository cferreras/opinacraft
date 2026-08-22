import assert from "node:assert/strict";
import test from "node:test";

test("availability legend identifies completed intervals without history", async () => {
  const historyChart = await import("../src/lib/servers/player-history-chart.ts");
  const getAvailabilityLegend = Reflect.get(historyChart, "getAvailabilityLegend") as undefined | (() => unknown);

  assert.deepEqual(getAvailabilityLegend?.(), [
    { status: "online", label: "En línea" },
    { status: "offline", label: "Sin respuesta" },
    { status: "unknown", label: "Sin comprobar" },
    { status: "no_data", label: "Sin histórico" },
  ]);
});

test("monitor samples are normalized to a UTC fifteen-minute slot", async () => {
  const { getMonitorSampleSlot } = await import("../src/lib/servers/monitor-persistence.ts");
  const slot = getMonitorSampleSlot(new Date("2026-08-03T12:14:59.000Z"));
  assert.equal(slot.toISOString(), "2026-08-03T12:00:00.000Z");
  assert.equal(getMonitorSampleSlot(new Date("2026-08-03T12:15:01.000Z")).toISOString(), "2026-08-03T12:15:00.000Z");
});

test("rollup coverage counts the fifteen-minute samples in each chart bucket", async () => {
  const { getExpectedSamplesPerPoint } = await import("../src/lib/servers/player-history.ts");
  assert.equal(getExpectedSamplesPerPoint(15), 1);
  assert.equal(getExpectedSamplesPerPoint(60), 4);
  assert.equal(getExpectedSamplesPerPoint(240), 16);
  assert.equal(getExpectedSamplesPerPoint(720), 48);
});

test("probe failures are classified without exposing target details", async () => {
  const { classifyProbeError } = await import("../src/lib/servers/monitor-persistence.ts");
  const { BlockedMinecraftTargetError, MinecraftDnsError } = await import("../src/lib/minecraft/network.ts");
  const { MinecraftResponseError, MinecraftTimeoutError } = await import("../src/lib/minecraft/ping.ts");
  assert.equal(classifyProbeError(new BlockedMinecraftTargetError()), "blocked_target");
  assert.equal(classifyProbeError(new MinecraftDnsError()), "dns_error");
  assert.equal(classifyProbeError(new MinecraftTimeoutError()), "timeout");
  assert.equal(classifyProbeError(new MinecraftResponseError()), "invalid_response");
  assert.equal(classifyProbeError(new Error("db unavailable")), "monitor_error");
});

test("history parameters default to the short public view", async () => {
  const { parseHistoryParams } = await import("../src/lib/servers/player-history.ts");
  assert.deepEqual(parseHistoryParams(), { period: "24h", edition: "all" });
  assert.deepEqual(parseHistoryParams("90d", "bedrock"), { period: "90d", edition: "all" });
  assert.deepEqual(parseHistoryParams("not-a-period", "not-an-edition"), { period: "24h", edition: "all" });
});

test("server view avoids summing potentially duplicated Java and Bedrock counts", async () => {
  const { aggregateHistorySeries } = await import("../src/lib/servers/player-history-aggregate.ts");
  const point = (at: string, players: number, capacity: number) => ({
    at,
    averagePlayers: players,
    peakPlayers: players,
    capacity,
    averageOccupancyPct: (players / capacity) * 100,
    responseRatePct: 100,
    monitorCoveragePct: 100,
    sampleCount: 1,
    status: "online" as const,
    sourceChanged: false,
  });
  const summary = (players: number, capacity: number, lastSampleAt = "2026-08-03T12:00:00.000Z") => ({
    currentPlayers: players,
    currentCapacity: capacity,
    currentStatus: "online" as const,
    averagePlayers: players,
    peakPlayers: players,
    averageOccupancyPct: (players / capacity) * 100,
    responseRatePct: 100,
    monitorCoveragePct: 100,
    sampleCount: 1,
    lastSampleAt,
    sourceChanges: 0,
  });
  const aggregate = aggregateHistorySeries([
    { edition: "java", points: [point("2026-08-03T12:00:00.000Z", 120, 300)], summary: summary(120, 300) },
    { edition: "bedrock", points: [point("2026-08-03T12:00:00.000Z", 80, 200)], summary: summary(80, 200, "2026-08-03T12:15:30.000Z") },
  ]);
  assert.equal(aggregate?.edition, "server");
  assert.equal(aggregate?.points[0]?.averagePlayers, 120);
  assert.equal(aggregate?.summary.averagePlayers, 120);
  assert.equal(aggregate?.summary.lastSampleAt, "2026-08-03T12:15:30.000Z");
});

test("player history keeps averages separate from whole-player peaks", async () => {
  const { aggregateHistorySeries } = await import("../src/lib/servers/player-history-aggregate.ts");
  const aggregate = aggregateHistorySeries([
    {
      edition: "java",
      points: [{ at: "2026-08-03T12:00:00.000Z", averagePlayers: 1.2, peakPlayers: 2, capacity: 100, averageOccupancyPct: 1.2, responseRatePct: 100, monitorCoveragePct: 100, sampleCount: 4, status: "online", sourceChanged: false }],
      summary: { currentPlayers: 1.2, currentCapacity: 100, currentStatus: "online", averagePlayers: 1.2, peakPlayers: 2, averageOccupancyPct: 1.2, responseRatePct: 100, monitorCoveragePct: 100, sampleCount: 4, lastSampleAt: "2026-08-03T12:00:00.000Z", sourceChanges: 0 },
    },
  ]);
  assert.equal(aggregate?.points[0]?.averagePlayers, 1.2);
  assert.equal(aggregate?.points[0]?.peakPlayers, 2);
  assert.equal(aggregate?.summary.currentPlayers, 1.2);
  assert.equal(aggregate?.summary.averagePlayers, 1.2);
});

test("player history chart preserves the observed peak across wider intervals", async () => {
  const { mergeHistoryChartData } = await import("../src/lib/servers/player-history-chart.ts");
  const chart = mergeHistoryChartData([
    {
      edition: "server",
      points: [{ at: "2026-08-03T12:00:00.000Z", averagePlayers: 6, peakPlayers: 10, capacity: 100, averageOccupancyPct: 6, responseRatePct: 100, monitorCoveragePct: 100, sampleCount: 16, status: "online", sourceChanged: false }],
      summary: { currentPlayers: 6, currentCapacity: 100, currentStatus: "online", averagePlayers: 6, peakPlayers: 10, averageOccupancyPct: 6, responseRatePct: 100, monitorCoveragePct: 100, sampleCount: 16, lastSampleAt: "2026-08-03T12:00:00.000Z", sourceChanges: 0 },
    },
  ]);
  assert.equal(chart[0]?.serverPeak, 10);
});

test("player history chart stops at the last observed player sample", async () => {
  const { trimTrailingEmptyChartPoints } = await import("../src/lib/servers/player-history-chart.ts");
  const point = (at: string, serverPeak: number | null) => ({
    at,
    averagePlayers: serverPeak,
    peakPlayers: serverPeak,
    capacity: 20,
    averageOccupancyPct: serverPeak,
    responseRatePct: serverPeak === null ? 0 : 100,
    monitorCoveragePct: serverPeak === null ? 0 : 100,
    sampleCount: serverPeak === null ? 0 : 1,
    status: serverPeak === null ? "no_data" as const : "online" as const,
    sourceChanged: false,
    serverPeak,
  });
  const chart = trimTrailingEmptyChartPoints([
    point("2026-08-22T18:45:00.000Z", 3),
    point("2026-08-22T19:00:00.000Z", 0),
    point("2026-08-22T19:15:00.000Z", null),
    point("2026-08-23T00:00:00.000Z", null),
  ]);

  assert.deepEqual(chart.map((entry) => entry.at), [
    "2026-08-22T18:45:00.000Z",
    "2026-08-22T19:00:00.000Z",
  ]);
});

test("player history chart uses a small regular set of time ticks", async () => {
  const { getPlayerHistoryChartTicks } = await import("../src/lib/servers/player-history-chart.ts");
  const points = Array.from({ length: 96 }, (_, index) => ({
    at: new Date(Date.UTC(2026, 7, 22, 1, 15 + index * 15)).toISOString(),
  }));

  assert.deepEqual(getPlayerHistoryChartTicks(points), [
    "2026-08-22T01:15:00.000Z",
    "2026-08-22T04:15:00.000Z",
    "2026-08-22T07:15:00.000Z",
    "2026-08-22T10:15:00.000Z",
    "2026-08-22T13:15:00.000Z",
    "2026-08-22T16:15:00.000Z",
    "2026-08-22T19:15:00.000Z",
    "2026-08-22T22:15:00.000Z",
    "2026-08-23T01:00:00.000Z",
  ]);
});

test("player history chart formats axis ticks as local time only", async () => {
  const { formatLocalizedDate } = await import("../src/lib/time/localized.ts");

  assert.equal(
    formatLocalizedDate("2026-08-22T01:15:00.000Z", "es-ES", "time", new Date("2026-08-23T00:00:00.000Z"), "Europe/Madrid"),
    "03:15",
  );
});

test("player history tooltip separates the metric label from its numeric value", async () => {
  const { chartTooltipValueRowClassName } = await import("../src/lib/charts/tooltip.ts");
  assert.match(chartTooltipValueRowClassName, /(?:^|\s)gap-2(?:\s|$)/);
});

test("server history keeps gaps and derives weighted response statistics", async () => {
  const { aggregateHistorySeries } = await import("../src/lib/servers/player-history-aggregate.ts");
  const at = "2026-08-03T12:00:00.000Z";
  const aggregate = aggregateHistorySeries([
    {
      edition: "java",
      points: [{ at, averagePlayers: null, peakPlayers: null, capacity: null, averageOccupancyPct: null, responseRatePct: 0, monitorCoveragePct: 50, sampleCount: 0, status: "no_data", sourceChanged: false }],
      summary: { currentPlayers: null, currentCapacity: null, currentStatus: "no_data", averagePlayers: null, peakPlayers: null, averageOccupancyPct: null, responseRatePct: 0, monitorCoveragePct: 50, sampleCount: 0, lastSampleAt: null, sourceChanges: 0 },
    },
    {
      edition: "bedrock",
      points: [{ at, averagePlayers: 30, peakPlayers: 40, capacity: 100, averageOccupancyPct: 30, responseRatePct: 75, monitorCoveragePct: 100, sampleCount: 4, status: "online", sourceChanged: true }],
      summary: { currentPlayers: 30, currentCapacity: 100, currentStatus: "online", averagePlayers: 30, peakPlayers: 40, averageOccupancyPct: 30, responseRatePct: 75, monitorCoveragePct: 100, sampleCount: 4, lastSampleAt: "2026-08-03T12:14:00.000Z", sourceChanges: 1 },
    },
  ]);
  assert.equal(aggregate?.points[0]?.status, "online");
  assert.equal(aggregate?.points[0]?.sourceChanged, true);
  assert.equal(aggregate?.summary.responseRatePct, 75);
  assert.equal(aggregate?.summary.monitorCoveragePct, 100);
  assert.equal(aggregate?.summary.sampleCount, 4);
  assert.equal(aggregate?.summary.sourceChanges, 1);
  assert.equal(aggregateHistorySeries([]), null);
});
