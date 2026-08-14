import assert from "node:assert/strict";
import test from "node:test";

import { runEndpointMonitor } from "../src/lib/servers/monitor.ts";

test("legacy monitor entry point only dispatches jobs", async () => {
  let dispatched = 0;
  const result = await runEndpointMonitor(async () => {
    dispatched += 1;
    return { enqueued: 4, due: 4, oldestDueAt: "2026-08-14T10:00:00.000Z" };
  });

  assert.equal(dispatched, 1);
  assert.deepEqual(result, {
    processed: 4,
    online: 0,
    offline: 0,
    unknown: 0,
    persistenceFailures: 0,
  });
});
