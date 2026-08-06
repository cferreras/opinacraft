import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  createMonitorPostHandler,
  isValidMonitorAuthorization,
  methodNotAllowed,
} from "../src/lib/servers/monitor-route.ts";

const secret = randomBytes(32).toString("hex");

function request(headers?: HeadersInit) {
  return new Request("http://localhost/api/internal/monitor/run", {
    method: "POST",
    headers,
  });
}

function result(processed = 2) {
  return {
    processed,
    online: 1,
    offline: 1,
    unknown: 0,
    persistenceFailures: 0,
  };
}

test("monitor authorization requires the exact Bearer secret", () => {
  assert.equal(isValidMonitorAuthorization(`Bearer ${secret}`, secret), true);
  assert.equal(isValidMonitorAuthorization("Bearer wrong-secret", secret), false);
  assert.equal(isValidMonitorAuthorization(secret, secret), false);
  assert.equal(isValidMonitorAuthorization(null, secret), false);
  assert.equal(isValidMonitorAuthorization(`Bearer ${secret}`, undefined), false);
});

test("monitor route rejects methods other than POST with JSON", async () => {
  const response = methodNotAllowed();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.deepEqual(await response.json(), { error: "Method not allowed" });
});

test("monitor route returns a concise successful result", async () => {
  let calls = 0;
  const logs: unknown[] = [];
  const handler = createMonitorPostHandler({
    expectedSecret: secret,
    runMonitor: async () => {
      calls += 1;
      return result();
    },
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });

  const response = await handler(request({ authorization: `Bearer ${secret}` }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(body.ok, true);
  assert.equal(body.processed, 2);
  assert.equal(typeof body.durationMs, "number");
  assert.equal("nonce" in body, false);
  assert.equal("fallback" in body, false);
  assert.match(JSON.stringify(logs), /serversProcessed/);
  assert.equal(JSON.stringify(logs).includes(secret), false);
});

test("monitor route returns 401 without exposing the configured secret", async () => {
  const handler = createMonitorPostHandler({
    expectedSecret: secret,
    runMonitor: async () => {
      throw new Error("must not run");
    },
  });

  const response = await handler(request({ authorization: "Bearer wrong-secret" }));
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { error: "Unauthorized" });
  assert.equal(body.includes(secret), false);
});

test("monitor route maps runner failures and partial persistence to 500", async () => {
  const logs: unknown[] = [];
  const failing = createMonitorPostHandler({
    expectedSecret: secret,
    runMonitor: async () => {
      throw new Error("private endpoint details must stay out of the response");
    },
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  const failedResponse = await failing(request({ authorization: `Bearer ${secret}` }));
  assert.equal(failedResponse.status, 500);
  assert.deepEqual(await failedResponse.json(), { error: "Internal monitor error" });
  assert.equal(JSON.stringify(logs).includes("private endpoint details"), false);

  const partial = createMonitorPostHandler({
    expectedSecret: secret,
    runMonitor: async () => ({ ...result(3), persistenceFailures: 1 }),
    logger: { info: () => undefined, error: () => undefined },
  });
  const partialResponse = await partial(request({ authorization: `Bearer ${secret}` }));
  assert.equal(partialResponse.status, 500);
  assert.equal((await partialResponse.json()).persistenceFailures, 1);
});

test("concurrent monitor requests do not process the same run twice", async () => {
  let active = false;
  let processedRuns = 0;
  let releaseFirst!: () => void;
  const firstFinished = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const handler = createMonitorPostHandler({
    expectedSecret: secret,
    runMonitor: async () => {
      if (active) return null;
      active = true;
      processedRuns += 1;
      await firstFinished;
      active = false;
      return result(1);
    },
    logger: { info: () => undefined, error: () => undefined },
  });

  const first = handler(request({ authorization: `Bearer ${secret}` }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  const second = await handler(request({ authorization: `Bearer ${secret}` }));
  releaseFirst();
  const firstResponse = await first;

  assert.equal(firstResponse.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).skipped, true);
  assert.equal((await firstResponse.json()).processed, 1);
  assert.equal(processedRuns, 1);
});
