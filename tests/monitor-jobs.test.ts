import assert from "node:assert/strict";
import test from "node:test";
import { getMonitorJobRetry, getMonitorScheduleSlot } from "../src/lib/servers/monitor-jobs.ts";

test("job slots are aligned to the server cadence", () => {
  assert.equal(getMonitorScheduleSlot(15, new Date("2026-08-14T10:47:59.000Z")).toISOString(), "2026-08-14T10:45:00.000Z");
  assert.equal(getMonitorScheduleSlot(60, new Date("2026-08-14T10:47:59.000Z")).toISOString(), "2026-08-14T10:00:00.000Z");
});

test("retryable monitor failures move a job through the one-five-fifteen-minute backoff", () => {
  const now = new Date("2026-08-14T10:00:00.000Z");
  assert.deepEqual(getMonitorJobRetry(1, now), { status: "pending", nextAttemptAt: new Date("2026-08-14T10:01:00.000Z") });
  assert.deepEqual(getMonitorJobRetry(2, now), { status: "pending", nextAttemptAt: new Date("2026-08-14T10:05:00.000Z") });
  assert.deepEqual(getMonitorJobRetry(3, now), { status: "pending", nextAttemptAt: new Date("2026-08-14T10:15:00.000Z") });
  assert.deepEqual(getMonitorJobRetry(4, now), { status: "failed", nextAttemptAt: null });
});
