import assert from "node:assert/strict";
import test from "node:test";

async function loadJobs() {
  try {
    return await import("../src/lib/servers/monitor-jobs.ts");
  } catch {
    return {} as typeof import("../src/lib/servers/monitor-jobs.ts");
  }
}

test("job slots are aligned to the server cadence", async () => {
  const jobs = await loadJobs();
  assert.equal(typeof jobs.getMonitorScheduleSlot, "function");
  if (typeof jobs.getMonitorScheduleSlot !== "function") return;

  assert.equal(jobs.getMonitorScheduleSlot(new Date("2026-08-14T10:47:59.000Z"), 15).toISOString(), "2026-08-14T10:45:00.000Z");
  assert.equal(jobs.getMonitorScheduleSlot(new Date("2026-08-14T10:47:59.000Z"), 60).toISOString(), "2026-08-14T10:00:00.000Z");
});

test("retryable monitor failures move a job through the one-five-fifteen-minute backoff", async () => {
  const jobs = await loadJobs();
  assert.equal(typeof jobs.getMonitorJobRetry, "function");
  if (typeof jobs.getMonitorJobRetry !== "function") return;

  const now = new Date("2026-08-14T10:00:00.000Z");
  assert.deepEqual(jobs.getMonitorJobRetry(1, now), { status: "pending", nextAttemptAt: new Date("2026-08-14T10:01:00.000Z") });
  assert.deepEqual(jobs.getMonitorJobRetry(2, now), { status: "pending", nextAttemptAt: new Date("2026-08-14T10:05:00.000Z") });
  assert.deepEqual(jobs.getMonitorJobRetry(3, now), { status: "pending", nextAttemptAt: new Date("2026-08-14T10:15:00.000Z") });
  assert.deepEqual(jobs.getMonitorJobRetry(4, now), { status: "failed", nextAttemptAt: null });
});
