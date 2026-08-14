import assert from "node:assert/strict";
import test from "node:test";

type Endpoint = {
  edition: "java" | "bedrock";
  verificationStatus: "unverified" | "verified";
  host: string;
  port: number;
};

async function loadScheduling() {
  try {
    return await import("../src/lib/servers/monitor-scheduling.ts");
  } catch {
    return {} as typeof import("../src/lib/servers/monitor-scheduling.ts");
  }
}

test("published visible servers use the fifteen-minute cadence", async () => {
  const scheduling = await loadScheduling();
  assert.equal(typeof scheduling.getMonitorCadenceMinutes, "function");
  if (typeof scheduling.getMonitorCadenceMinutes !== "function") return;

  assert.equal(scheduling.getMonitorCadenceMinutes({
    publicationStatus: "published",
    moderationStatus: "active",
    availabilityHiddenAt: null,
    hasVerifiedEndpoint: true,
  }), 15);
});

test("non-visible servers with a verified endpoint use the sixty-minute cadence", async () => {
  const scheduling = await loadScheduling();
  assert.equal(typeof scheduling.getMonitorCadenceMinutes, "function");
  if (typeof scheduling.getMonitorCadenceMinutes !== "function") return;

  assert.equal(scheduling.getMonitorCadenceMinutes({
    publicationStatus: "draft",
    moderationStatus: "active",
    availabilityHiddenAt: null,
    hasVerifiedEndpoint: true,
  }), 60);
  assert.equal(scheduling.getMonitorCadenceMinutes({
    publicationStatus: "published",
    moderationStatus: "active",
    availabilityHiddenAt: new Date("2026-08-14T10:00:00.000Z"),
    hasVerifiedEndpoint: true,
  }), 60);
  assert.equal(scheduling.getMonitorCadenceMinutes({
    publicationStatus: "draft",
    moderationStatus: "active",
    availabilityHiddenAt: null,
    hasVerifiedEndpoint: false,
  }), null);
});

test("canonical probe prefers verified Java and falls back to verified Bedrock", async () => {
  const scheduling = await loadScheduling();
  assert.equal(typeof scheduling.selectCanonicalEndpoint, "function");
  if (typeof scheduling.selectCanonicalEndpoint !== "function") return;

  const endpoints: Endpoint[] = [
    { edition: "bedrock", verificationStatus: "verified", host: "play.example.com", port: 19132 },
    { edition: "java", verificationStatus: "verified", host: "play.example.com", port: 25565 },
  ];
  assert.deepEqual(scheduling.selectCanonicalEndpoint(endpoints), endpoints[1]);
  assert.deepEqual(scheduling.selectCanonicalEndpoint([endpoints[0], { ...endpoints[1], verificationStatus: "unverified" }]), endpoints[0]);
  assert.equal(scheduling.selectCanonicalEndpoint([{ ...endpoints[0], verificationStatus: "unverified" }]), null);
});

test("monitor freshness uses twice the configured cadence", async () => {
  const scheduling = await loadScheduling();
  assert.equal(typeof scheduling.getMonitorFreshness, "function");
  if (typeof scheduling.getMonitorFreshness !== "function") return;

  const now = new Date("2026-08-14T10:00:00.000Z");
  assert.equal(scheduling.getMonitorFreshness(null, 15, now), "never");
  assert.equal(scheduling.getMonitorFreshness(new Date("2026-08-14T09:29:00.000Z"), 15, now), "stale");
  assert.equal(scheduling.getMonitorFreshness(new Date("2026-08-14T09:31:00.000Z"), 60, now), "fresh");
  assert.equal(scheduling.getMonitorFreshness(new Date("2026-08-14T07:59:00.000Z"), 60, now), "stale");
});

test("worker retry delays are one, five, and fifteen minutes", async () => {
  const scheduling = await loadScheduling();
  assert.equal(typeof scheduling.getMonitorRetryDelayMs, "function");
  if (typeof scheduling.getMonitorRetryDelayMs !== "function") return;

  assert.equal(scheduling.getMonitorRetryDelayMs(1), 60_000);
  assert.equal(scheduling.getMonitorRetryDelayMs(2), 300_000);
  assert.equal(scheduling.getMonitorRetryDelayMs(3), 900_000);
  assert.equal(scheduling.getMonitorRetryDelayMs(4), null);
});
