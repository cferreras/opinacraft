import assert from "node:assert/strict";
import test from "node:test";

type Endpoint = {
  edition: "java" | "bedrock";
  verificationStatus: "unverified" | "verified";
  host: string;
  port: number;
};

async function loadEngine() {
  try {
    return await import("../src/lib/servers/monitor-worker-core.ts");
  } catch {
    return {} as typeof import("../src/lib/servers/monitor-worker-core.ts");
  }
}

test("a server job probes one canonical endpoint even when both editions exist", async () => {
  const engine = await loadEngine();
  assert.equal(typeof engine.runCanonicalMonitorJob, "function");
  if (typeof engine.runCanonicalMonitorJob !== "function") return;

  const endpoints: Endpoint[] = [
    { edition: "bedrock", verificationStatus: "verified", host: "play.example.com", port: 19132 },
    { edition: "java", verificationStatus: "verified", host: "play.example.com", port: 25565 },
  ];
  const probed: Endpoint[] = [];
  const persisted: unknown[] = [];
  const result = await engine.runCanonicalMonitorJob({
    serverId: "server-1",
    scheduledAt: new Date("2026-08-14T10:00:00.000Z"),
    endpoints,
    probe: async (endpoint) => {
      probed.push(endpoint);
      return { status: "online" as const, playersCurrent: 42, playersMax: 100, version: "1.21", latencyMs: 35 };
    },
    persist: async (observation) => {
      persisted.push(observation);
    },
  });

  assert.equal(probed.length, 1);
  assert.equal(probed[0]?.edition, "java");
  assert.equal(result.status, "online");
  assert.equal(persisted.length, 1);
  assert.equal((persisted[0] as { probeEdition: string }).probeEdition, "java");
});

test("a server job falls back to verified Bedrock when Java is not verified", async () => {
  const engine = await loadEngine();
  assert.equal(typeof engine.runCanonicalMonitorJob, "function");
  if (typeof engine.runCanonicalMonitorJob !== "function") return;

  const endpoints: Endpoint[] = [
    { edition: "java", verificationStatus: "unverified", host: "play.example.com", port: 25565 },
    { edition: "bedrock", verificationStatus: "verified", host: "play.example.com", port: 19132 },
  ];
  let selected: Endpoint | undefined;
  await engine.runCanonicalMonitorJob({
    serverId: "server-1",
    scheduledAt: new Date("2026-08-14T10:00:00.000Z"),
    endpoints,
    probe: async (endpoint) => {
      selected = endpoint;
      return { status: "offline" as const, playersCurrent: null, playersMax: null, version: null, latencyMs: null };
    },
    persist: async () => undefined,
  });

  assert.ok(selected);
  assert.equal(selected.edition, "bedrock");
});

test("an offline probe is persisted as a valid observation instead of a worker error", async () => {
  const engine = await loadEngine();
  assert.equal(typeof engine.runCanonicalMonitorJob, "function");
  if (typeof engine.runCanonicalMonitorJob !== "function") return;

  let persistedStatus: string | undefined;
  const result = await engine.runCanonicalMonitorJob({
    serverId: "server-1",
    scheduledAt: new Date("2026-08-14T10:00:00.000Z"),
    endpoints: [{ edition: "java", verificationStatus: "verified", host: "play.example.com", port: 25565 }],
    probe: async () => ({ status: "offline" as const, failureCode: "timeout" as const, playersCurrent: null, playersMax: null, version: null, latencyMs: null }),
    persist: async (observation) => {
      persistedStatus = observation.status;
    },
  });

  assert.equal(result.status, "offline");
  assert.equal(persistedStatus, "offline");
});
