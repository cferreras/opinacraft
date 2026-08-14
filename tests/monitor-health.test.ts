import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorHealthHandler } from "../src/workers/monitor-worker-health.ts";

test("worker health is ready only after a successful database heartbeat", async () => {
  const ready = createMonitorHealthHandler(() => ({ workerId: "worker-1", healthy: true, queueAgeSeconds: 4 }));
  const readyResponse = await ready(new Request("http://localhost/healthz"));
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), { status: "ok", workerId: "worker-1", queueAgeSeconds: 4 });

  const unhealthy = createMonitorHealthHandler(() => ({ workerId: "worker-1", healthy: false, queueAgeSeconds: null }));
  const unhealthyResponse = await unhealthy(new Request("http://localhost/healthz"));
  assert.equal(unhealthyResponse.status, 503);
  assert.deepEqual(await unhealthyResponse.json(), { status: "unhealthy", workerId: "worker-1", queueAgeSeconds: null });
});
