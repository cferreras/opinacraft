import assert from "node:assert/strict";
import test from "node:test";

async function loadHistory() {
  try {
    return await import("../src/lib/servers/monitor-history.ts");
  } catch {
    return {} as typeof import("../src/lib/servers/monitor-history.ts");
  }
}

test("legacy Java and Bedrock snapshots merge to one canonical interval without summing players", async () => {
  const history = await loadHistory();
  assert.equal(typeof history.mergeLegacySnapshotsBySlot, "function");
  if (typeof history.mergeLegacySnapshotsBySlot !== "function") return;

  const merged = history.mergeLegacySnapshotsBySlot([
    { serverId: "server-1", edition: "java", sampledAt: new Date("2026-08-14T10:00:00.000Z"), status: "online", playersCurrent: 120, playersMax: 300 },
    { serverId: "server-1", edition: "bedrock", sampledAt: new Date("2026-08-14T10:00:00.000Z"), status: "online", playersCurrent: 80, playersMax: 200 },
  ]);

  assert.deepEqual(merged, [{
    serverId: "server-1",
    sampledAt: new Date("2026-08-14T10:00:00.000Z"),
    status: "online",
    playersCurrent: 120,
    playersMax: 300,
  }]);
});

test("canonical history preserves offline state when every legacy edition is offline", async () => {
  const history = await loadHistory();
  assert.equal(typeof history.mergeLegacySnapshotsBySlot, "function");
  if (typeof history.mergeLegacySnapshotsBySlot !== "function") return;

  const merged = history.mergeLegacySnapshotsBySlot([
    { serverId: "server-1", edition: "java", sampledAt: new Date("2026-08-14T10:00:00.000Z"), status: "offline", playersCurrent: null, playersMax: null },
    { serverId: "server-1", edition: "bedrock", sampledAt: new Date("2026-08-14T10:00:00.000Z"), status: "offline", playersCurrent: null, playersMax: null },
  ]);

  assert.equal(merged[0]?.status, "offline");
  assert.equal(merged[0]?.playersCurrent, null);
});
