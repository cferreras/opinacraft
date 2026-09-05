import assert from "node:assert/strict";
import test from "node:test";
import { buildMonitorHistory } from "../src/lib/monitor/history.ts";

test("monitor history carries a fresh previous status into the current availability slot without inventing a sample", () => {
  const history = buildMonitorHistory({
    period: "24h",
    now: new Date("2026-08-22T10:07:00.000Z"),
    cadenceMinutes: 15,
    lastUpdatedAt: new Date("2026-08-22T10:01:00.000Z"),
    probeEdition: "java",
    rows: {
      raw: true,
      rows: [{
        scheduled_at: "2026-08-22T09:45:00.000Z",
        observed_at: "2026-08-22T10:01:00.000Z",
        probe_edition: "java",
        status: "online",
        players_current: 5,
        players_max: 20,
      }],
    },
  });

  const points = history.series[0]?.points ?? [];
  assert.deepEqual(points.at(-1), {
    at: "2026-08-22T10:00:00.000Z",
    averagePlayers: null,
    peakPlayers: null,
    capacity: null,
    averageOccupancyPct: null,
    responseRatePct: 0,
    monitorCoveragePct: 0,
    sampleCount: 0,
    status: "online",
    sourceChanged: false,
  });
  assert.equal(points.at(-2)?.at, "2026-08-22T09:45:00.000Z");
  assert.equal(points.at(-2)?.sampleCount, 1);
});

test("monitor history keeps the current availability slot gray when the previous status is stale", () => {
  const history = buildMonitorHistory({
    period: "24h",
    now: new Date("2026-08-22T10:40:00.000Z"),
    cadenceMinutes: 15,
    lastUpdatedAt: new Date("2026-08-22T10:01:00.000Z"),
    probeEdition: "java",
    rows: {
      raw: true,
      rows: [{
        scheduled_at: "2026-08-22T10:00:00.000Z",
        observed_at: "2026-08-22T10:01:00.000Z",
        probe_edition: "java",
        status: "online",
        players_current: 5,
        players_max: 20,
      }],
    },
  });

  const current = history.series[0]?.points.at(-1);
  assert.equal(current?.at, "2026-08-22T10:30:00.000Z");
  assert.equal(current?.status, "no_data");
  assert.equal(current?.sampleCount, 0);
});

test("monitor history includes a jittered sample from the current interval immediately", () => {
  const history = buildMonitorHistory({
    period: "24h",
    now: new Date("2026-08-22T10:07:00.000Z"),
    cadenceMinutes: 15,
    lastUpdatedAt: new Date("2026-08-22T10:04:00.000Z"),
    probeEdition: "java",
    rows: {
      raw: true,
      rows: [{
        scheduled_at: "2026-08-22T10:03:00.000Z",
        observed_at: "2026-08-22T10:04:00.000Z",
        probe_edition: "java",
        status: "online",
        players_current: 4,
        players_max: 20,
      }],
    },
  });

  assert.equal(history.series[0]?.points.at(-1)?.at, "2026-08-22T10:00:00.000Z");
  assert.equal(history.series[0]?.points.at(-1)?.status, "online");
});
