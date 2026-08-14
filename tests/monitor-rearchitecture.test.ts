import assert from "node:assert/strict";
import test from "node:test";

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
  } as never);

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
