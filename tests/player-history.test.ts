import assert from "node:assert/strict";
import test from "node:test";

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
  assert.deepEqual(parseHistoryParams("90d", "bedrock"), { period: "90d", edition: "bedrock" });
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
  const summary = (players: number, capacity: number) => ({
    currentPlayers: players,
    currentCapacity: capacity,
    currentStatus: "online" as const,
    averagePlayers: players,
    peakPlayers: players,
    averageOccupancyPct: (players / capacity) * 100,
    responseRatePct: 100,
    monitorCoveragePct: 100,
    sampleCount: 1,
    lastSampleAt: "2026-08-03T12:00:00.000Z",
    sourceChanges: 0,
  });
  const aggregate = aggregateHistorySeries([
    { edition: "java", points: [point("2026-08-03T12:00:00.000Z", 120, 300)], summary: summary(120, 300) },
    { edition: "bedrock", points: [point("2026-08-03T12:00:00.000Z", 80, 200)], summary: summary(80, 200) },
  ]);
  assert.equal(aggregate?.edition, "server");
  assert.equal(aggregate?.points[0]?.averagePlayers, 120);
  assert.equal(aggregate?.summary.averagePlayers, 120);
});
