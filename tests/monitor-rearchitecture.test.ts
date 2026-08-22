import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as backfillHelpers from "../scripts/backfill-monitor-queries.mjs";

import {
  createServerInputSchema,
  normalizeCreateServerInput,
} from "../src/lib/servers/validation.ts";
import {
  createMonitorPostHandler,
} from "../src/lib/servers/monitor-route.ts";
import {
  getExpectedSamplesPerPoint,
  getExpectedSamplesForSlot,
  parseHistoryParams,
} from "../src/lib/servers/player-history.ts";

const secret = "a".repeat(32);
const backfillSource = readFileSync(new URL("../scripts/backfill-monitor.mjs", import.meta.url), "utf8");

test("backfill scopes Neon history to target IDs from Monitor DB", () => {
  const query = backfillHelpers.buildHistorySourceQuery({
    table: "server_player_snapshots",
    alias: "s",
    columns: ["s.server_id", "s.scheduled_at"],
    orderBy: "s.server_id, s.scheduled_at",
  });

  assert.match(query, /s\.server_id = any\(\$1::uuid\[\]\)/i);
  assert.doesNotMatch(query, /monitor_targets/i);
  assert.match(backfillSource, /backfill-monitor-queries\.mjs/);
  assert.match(backfillSource, /buildHistorySourceQuery/);
});

test("backfill rebuilds an overlapping hourly bucket without double counting legacy samples", () => {
  const mergeHourlyBackfillRow = Reflect.get(backfillHelpers, "mergeHourlyBackfillRow") as undefined | ((source: unknown, snapshots: unknown[]) => unknown);
  const source = {
    serverId: "server-1",
    bucketStart: new Date("2026-08-22T10:00:00.000Z"),
    lastProbeEdition: "java",
    sourceChanged: 0,
    sampleCount: 2,
    onlineCount: 1,
    unknownCount: 0,
    playerDataCount: 1,
    playersTotal: 3,
    playersPeak: 3,
    capacityDataCount: 1,
    capacityTotal: 20,
    capacityLatest: 20,
    occupancyDataCount: 1,
    occupancyBasisPointsTotal: 1500,
    lastObservedAt: new Date("2026-08-22T10:20:00.000Z"),
  };
  const snapshots = [
    { observedAt: new Date("2026-08-22T10:19:00.000Z"), probeEdition: "java", status: "online", playersCurrent: 99, playersMax: 100 },
    { observedAt: new Date("2026-08-22T10:31:00.000Z"), probeEdition: "java", status: "online", playersCurrent: 5, playersMax: 20 },
    { observedAt: new Date("2026-08-22T10:46:00.000Z"), probeEdition: "java", status: "offline", playersCurrent: null, playersMax: null },
  ];

  assert.deepEqual(mergeHourlyBackfillRow?.(source, snapshots), {
    ...source,
    sampleCount: 4,
    onlineCount: 2,
    playerDataCount: 2,
    playersTotal: 8,
    playersPeak: 5,
    capacityDataCount: 2,
    capacityTotal: 40,
    capacityLatest: 20,
    occupancyDataCount: 2,
    occupancyBasisPointsTotal: 4000,
    lastObservedAt: new Date("2026-08-22T10:46:00.000Z"),
  });
});

test("backfill verification rejects missing source history", () => {
  const assertBackfillVerification = Reflect.get(backfillHelpers, "assertBackfillVerification") as undefined | ((summary: unknown) => unknown);

  assert.throws(() => assertBackfillVerification?.({
    targets: 1,
    sourceSnapshots: 12,
    missingSnapshots: 1,
    sourceHourly: 3,
    missingHourly: 0,
  }), /missing 1 snapshot/i);
});

test("backfill verification rejects an hourly aggregate mismatch", () => {
  const assertBackfillVerification = Reflect.get(backfillHelpers, "assertBackfillVerification") as undefined | ((summary: unknown) => unknown);

  assert.throws(() => assertBackfillVerification?.({
    targets: 1,
    sourceSnapshots: 12,
    missingSnapshots: 0,
    sourceHourly: 3,
    missingHourly: 0,
    mismatchedHourly: 1,
  }), /mismatched 1 hourly/i);
});

test("backfill locks history writes while rebuilding overlapping buckets", () => {
  const getBackfillHistoryLockSql = Reflect.get(backfillHelpers, "getBackfillHistoryLockSql") as undefined | (() => unknown);

  assert.equal(
    getBackfillHistoryLockSql?.(),
    "lock table monitor_player_snapshots, monitor_player_hourly in share row exclusive mode",
  );
});

test("normalizes one shared host with optional edition ports", () => {
  const normalized = normalizeCreateServerInput({
    name: "A Minecraft Community",
    host: " PLAY.Example.COM. ",
    javaPort: 25565,
    bedrockPort: 19132,
  });

  assert.deepEqual(normalized, {
    name: "A Minecraft Community",
    description: null,
    websiteUrl: null,
    storeUrl: null,
    discordUrl: null,
    accessType: "open",
    accessFormUrl: null,
    accountMode: "premium_only",
    authMode: "direct",
    tags: [],
    host: "play.example.com",
    endpoints: [
      { edition: "java", host: "play.example.com", port: 25565 },
      { edition: "bedrock", host: "play.example.com", port: 19132 },
    ],
  });
});

test("requires at least one edition port for a shared host", () => {
  assert.equal(createServerInputSchema.safeParse({
    name: "A Minecraft Community",
    host: "play.example.com",
  }).success, false);
});

test("rejects legacy payloads that try to keep different hosts per edition", () => {
  assert.throws(() => normalizeCreateServerInput({
    name: "A Minecraft Community",
    endpoints: [
      { edition: "java", host: "java.example.com" },
      { edition: "bedrock", host: "bedrock.example.com" },
    ],
  }), /same host/i);
});

test("legacy history edition parameters always resolve to the canonical server view", () => {
  assert.deepEqual(parseHistoryParams("7d", "bedrock"), {
    period: "7d",
    edition: "all",
  });
});

test("history coverage uses the server cadence instead of a fixed fifteen-minute denominator", () => {
  assert.equal(getExpectedSamplesPerPoint(60, 15), 4);
  assert.equal(getExpectedSamplesPerPoint(60, 60), 1);
  assert.equal(getExpectedSamplesPerPoint(240, 60), 4);
});

test("history coverage accounts for cadence changes inside a chart bucket", () => {
  const expected = getExpectedSamplesForSlot(
    new Date("2026-08-14T10:00:00.000Z"),
    60,
    [
      { cadenceMinutes: 15, effectiveFrom: new Date("2026-08-14T10:00:00.000Z"), effectiveTo: new Date("2026-08-14T10:30:00.000Z") },
      { cadenceMinutes: 60, effectiveFrom: new Date("2026-08-14T10:30:00.000Z"), effectiveTo: null },
    ],
  );
  assert.equal(expected, 3);
});

test("history coverage uses the fallback cadence before the first schedule record", () => {
  const expected = getExpectedSamplesForSlot(
    new Date("2026-08-14T09:00:00.000Z"),
    60,
    [{ cadenceMinutes: 60, effectiveFrom: new Date("2026-08-14T10:00:00.000Z"), effectiveTo: null }],
    15,
  );

  assert.equal(expected, 4);
});

test("manual monitor reconciliation enqueues work without running network probes", async () => {
  let probeRunnerCalled = false;
  const handler = createMonitorPostHandler({
    expectedSecret: secret,
    runMonitor: async () => {
      probeRunnerCalled = true;
      throw new Error("the HTTP route must not run probes");
    },
    enqueueMonitor: async () => ({
      enqueued: 3,
      due: 3,
      oldestDueAt: "2026-08-14T10:00:00.000Z",
    }),
  });

  const response = await handler(new Request("http://localhost/api/internal/monitor/run", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  }));

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    ok: true,
    enqueued: 3,
    due: 3,
    oldestDueAt: "2026-08-14T10:00:00.000Z",
  });
  assert.equal(probeRunnerCalled, false);
});
