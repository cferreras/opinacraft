import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertUtcTimestamp,
  serializeUtcTimestamp,
} from "../src/lib/monitor/contracts.ts";
import { runMonitorBusinessEventsBatch } from "../src/lib/monitor/business-events-runner.ts";
import { processPendingMonitorEvents } from "../src/lib/monitor/events.ts";
import { buildMonitorHistory } from "../src/lib/monitor/history.ts";
import {
  getMonitorBossConnectionString,
  getMonitorJobKey,
  getNextMonitorDate,
  scheduleMonitorBusinessEvents,
  sendMonitorCheck,
} from "../src/lib/monitor/queue.ts";
import { orderMonitorCandidates } from "../src/lib/servers/catalog-monitor.ts";
import { formatRelativeTime } from "../src/lib/time/localized.ts";
import { recoverDueMonitorSchedules } from "../src/lib/monitor/sweeper.ts";

test("monitor timestamps are accepted and serialized only as canonical UTC", () => {
  const value = new Date("2026-08-22T10:15:00.000Z");

  assert.equal(serializeUtcTimestamp(value), "2026-08-22T10:15:00.000Z");
  assert.equal(assertUtcTimestamp("2026-08-22T10:15:00.000Z"), "2026-08-22T10:15:00.000Z");
  assert.throws(() => assertUtcTimestamp("2026-08-22T12:15:00+02:00"), /UTC/i);
});

test("hourly event processor does not open Neon when Monitor API has no events", async () => {
  let neonCalls = 0;
  let processed = 0;

  const result = await processPendingMonitorEvents({
    claim: async () => [],
    processInNeon: async () => {
      neonCalls += 1;
    },
    ack: async () => {
      processed += 1;
    },
  });

  assert.deepEqual(result, { claimed: 0, processed: 0, failed: 0 });
  assert.equal(neonCalls, 0);
  assert.equal(processed, 0);
});

test("Dokploy business-event processor does not open Neon when Monitor API is empty", async () => {
  let neonCalls = 0;

  const result = await runMonitorBusinessEventsBatch({
    workerId: "monitor-events-1",
    claim: async () => [],
    processInNeon: async () => {
      neonCalls += 1;
    },
    ack: async () => undefined,
    fail: async () => undefined,
  });

  assert.deepEqual(result, {
    available: true,
    claimed: 0,
    processed: 0,
    failed: 0,
  });
  assert.equal(neonCalls, 0);
});

test("Dokploy business-event processor does not open Neon when Monitor API is unavailable", async () => {
  let neonCalls = 0;

  const result = await runMonitorBusinessEventsBatch({
    workerId: "monitor-events-1",
    claim: async () => null,
    processInNeon: async () => {
      neonCalls += 1;
    },
    ack: async () => undefined,
    fail: async () => undefined,
  });

  assert.deepEqual(result, {
    available: false,
    claimed: 0,
    processed: 0,
    failed: 0,
  });
  assert.equal(neonCalls, 0);
});

test("catalog monitor ordering paginates the global candidate set", () => {
  const result = orderMonitorCandidates(
    [
      { id: "a", status: "offline", players: null, latency: null, version: null, checkedAt: null },
      { id: "b", status: "online", players: 2, latency: 80, version: "1.20", checkedAt: "2026-08-22T10:00:00.000Z" },
      { id: "c", status: "online", players: 12, latency: 40, version: "1.21", checkedAt: "2026-08-22T10:05:00.000Z" },
    ],
    { status: "online", sort: "players", direction: "desc", page: 1, pageSize: 1 },
  );

  assert.deepEqual(result.ids, ["c"]);
  assert.equal(result.totalCount, 2);
});

test("catalog version ordering keeps unknown versions after known values", () => {
  const result = orderMonitorCandidates([
    { id: "unknown", status: "online", players: 2, latency: 80, version: null, checkedAt: null },
    { id: "known", status: "online", players: 2, latency: 80, version: "1.21", checkedAt: null },
  ], { sort: "version", direction: "asc", page: 1, pageSize: 10 });

  assert.deepEqual(result.ids, ["known", "unknown"]);
});

test("relative monitor labels use the visitor locale formatter", () => {
  assert.equal(formatRelativeTime(-2, "minute", "es-ES"), "hace 2 minutos");
  assert.equal(formatRelativeTime(-1, "hour", "es-ES"), "hace 1 hora");
});

test("scheduled monitor jobs use a slot-specific singleton key and bounded jitter", async () => {
  const scheduledAt = getNextMonitorDate(new Date("2026-08-22T10:00:00.000Z"), 15, 1);
  assert.equal(scheduledAt.toISOString(), "2026-08-22T10:17:00.000Z");
  assert.equal(getMonitorJobKey({ serverId: "server-1", scheduledAt: scheduledAt.toISOString() }), "monitor:server-1:2026-08-22T10:17:00.000Z");

  const received: Array<{ name: string; data: unknown; options: Record<string, unknown> }> = [];
  const send = async (name: string, data: object | null | undefined, options: { [key: string]: unknown } | undefined) => {
    received.push({ name, data, options: options ?? {} });
    return "job-1";
  };
  await sendMonitorCheck({ send } as never, { serverId: "server-1", cadenceMinutes: 15, sourceVersion: "7" }, scheduledAt);

  const captured = received[0];
  if (!captured) throw new Error("The mock boss did not receive a job.");
  assert.equal(captured.name, "monitor-checks");
  assert.equal((captured.options as { singletonKey?: string }).singletonKey, getMonitorJobKey({ serverId: "server-1", scheduledAt: scheduledAt.toISOString() }));
  assert.equal((captured.options as { startAfter?: Date }).startAfter?.toISOString(), scheduledAt.toISOString());
});

test("business-event processing is scheduled hourly in UTC through pg-boss", async () => {
  const calls: unknown[][] = [];
  await scheduleMonitorBusinessEvents({
    schedule: async (...args: unknown[]) => {
      calls.push(args);
    },
  } as never);

  assert.deepEqual(calls, [[
    "monitor-business-events",
    "0 * * * *",
    null,
    {
      key: "monitor-business-events-hourly",
      tz: "UTC",
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      deleteAfterSeconds: 3_600,
    },
  ]]);
});

test("pg-boss connections request a UTC session and optional TLS", () => {
  const value = new URL(getMonitorBossConnectionString("postgresql://monitor:secret@localhost:5432/opinacraft_monitor", true));
  assert.equal(value.searchParams.get("options"), "-c TimeZone=UTC");
  assert.equal(value.searchParams.get("sslmode"), "require");
});

test("the monitor sweeper reuses the due slot while recovering a job", async () => {
  const dueAt = new Date("2026-08-22T10:00:00.000Z");
  const sent: Date[] = [];
  const marked: Date[] = [];

  await recoverDueMonitorSchedules([
    { serverId: "server-1", cadenceMinutes: 15, sourceVersion: "7", nextDueAt: dueAt },
  ], {
    send: async (_target, scheduledAt) => { sent.push(scheduledAt); },
    markScheduled: async (_serverId, scheduledAt, nextDueAt) => {
      marked.push(scheduledAt, nextDueAt);
    },
  });

  assert.deepEqual(sent, [dueAt]);
  assert.deepEqual(marked, [dueAt, dueAt]);
});

test("Monitor API history keeps generated and bucket timestamps in UTC", () => {
  const result = buildMonitorHistory({
    period: "24h",
    now: new Date("2026-08-22T10:15:00.000Z"),
    cadenceMinutes: 15,
    lastUpdatedAt: new Date("2026-08-22T10:15:00.000Z"),
    freshness: "fresh",
    probeEdition: "java",
    rows: {
      raw: true,
      rows: [{
        scheduled_at: "2026-08-22T10:00:00.000Z",
        observed_at: "2026-08-22T10:00:02.000Z",
        probe_edition: "java",
        status: "online",
        players_current: 4,
        players_max: 20,
      }],
    },
  });

  assert.match(result.generatedAt, /Z$/);
  assert.match(result.series[0]?.points.at(-1)?.at ?? "", /Z$/);
  assert.equal(result.series[0]?.summary.lastSampleAt, "2026-08-22T10:00:02.000Z");
});

test("monitor state update casts the reused health parameter consistently", () => {
  const source = readFileSync("src/lib/monitor/repository.ts", "utf8");

  assert.match(source, /health_status = \$2::varchar,/);
  assert.match(source, /case when \$2::varchar = 'online' then \$7/);
});

test("hourly business-event route only loads Neon after a non-empty Monitor claim", () => {
  const source = readFileSync("src/app/api/internal/monitor/events/route.ts", "utf8");
  assert.doesNotMatch(source, /from ["']@\/db["']/);
  const claimPosition = source.indexOf("claimMonitorBusinessEvents");
  const neonImportPosition = source.indexOf('import("@/lib/monitor/neon-events")');
  assert.ok(claimPosition >= 0);
  assert.ok(neonImportPosition > claimPosition);
});

test("all public review pages share the server review-list cache tag", () => {
  const source = readFileSync("src/lib/servers/cached-queries.ts", "utf8");
  assert.match(source, /cacheTag\(reviewListTag\(serverId\)\)/);
});

test("Vercel keeps only the daily reconciliation cron", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };

  assert.deepEqual(vercel.crons, [{
    path: "/api/internal/monitor/reconcile",
    schedule: "30 3 * * *",
  }]);
});
