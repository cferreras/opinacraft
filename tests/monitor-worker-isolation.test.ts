import assert from "node:assert/strict";
import test from "node:test";

import { processMonitorCheckJob } from "../src/lib/monitor/worker-engine.ts";

const target = {
  serverId: "server-1",
  sourceVersion: "7",
  publicationStatus: "published" as const,
  moderationStatus: "active" as const,
  availabilityHiddenAt: null,
  networkHost: "play.example.test",
  cadenceMinutes: 15 as const,
  endpoints: [{ edition: "java" as const, historySourceId: "history-1", host: "play.example.test", port: 25565, verificationStatus: "verified" as const }],
};

test("worker check persists in Monitor DB and schedules the next slot without Neon", async () => {
  const calls: string[] = [];
  const scheduled: unknown[] = [];

  const result = await processMonitorCheckJob({
    job: { serverId: "server-1", scheduledAt: "2026-08-22T10:00:00.000Z", sourceVersion: "7" },
    getTarget: async () => target,
    probe: async () => ({ status: "online" as const, failureCode: null, playersCurrent: 4, playersMax: 20, version: "1.21", latencyMs: 42 }),
    persist: async () => { calls.push("monitor-persist"); },
    schedule: async (nextTarget, scheduledAt) => { scheduled.push({ nextTarget, scheduledAt }); },
    now: new Date("2026-08-22T10:01:00.000Z"),
  });

  assert.equal(result.status, "processed");
  assert.deepEqual(calls, ["monitor-persist"]);
  assert.equal(scheduled.length, 1);
});

test("stale endpoint jobs are skipped and replaced with a current target job", async () => {
  let persisted = false;
  let scheduled = 0;
  const result = await processMonitorCheckJob({
    job: { serverId: "server-1", scheduledAt: "2026-08-22T10:00:00.000Z", sourceVersion: "old" },
    getTarget: async () => target,
    probe: async () => { throw new Error("stale jobs must not probe"); },
    persist: async () => { persisted = true; },
    schedule: async () => { scheduled += 1; },
    now: new Date("2026-08-22T10:01:00.000Z"),
  });

  assert.equal(result.status, "stale");
  assert.equal(persisted, false);
  assert.equal(scheduled, 1);
});
