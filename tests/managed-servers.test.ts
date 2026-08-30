import assert from "node:assert/strict";
import test from "node:test";

import type { MonitorStatusView } from "../src/lib/monitor/repository.ts";
import { managedServerNotices } from "../src/lib/servers/managed-servers.ts";
import type { ManagedServer } from "../src/lib/servers/queries.ts";

function makeUnverifiedServer(): ManagedServer {
  const now = new Date("2026-08-29T10:00:00.000Z");

  return {
    id: "server-1",
    name: "Mi comunidad",
    slug: "mi-comunidad",
    description: null,
    websiteUrl: null,
    storeUrl: null,
    discordUrl: null,
    accessType: "open",
    accessFormUrl: null,
    accountMode: "premium_only",
    authMode: "direct",
    publicationStatus: "published",
    verificationStatus: "unverified",
    createdAt: now,
    updatedAt: now,
    availabilityHiddenAt: null,
    moderationStatus: "active",
    monitor: {
      healthStatus: "online",
      playersCurrent: 4,
      playersMax: 20,
      version: "1.21.8",
      latencyMs: 42,
      lastUpdatedAt: now,
      lastOnlineAt: now,
      offlineSince: null,
      lastRecoveredAt: null,
      lastStateChangeAt: now,
      consecutiveFailures: 0,
      probeEdition: "java",
      cadenceMinutes: 15,
      freshness: "fresh",
    },
    aggregateStatus: "online",
    role: "owner",
    endpoints: [{
      edition: "java",
      host: "play.example.com",
      port: 25565,
      verificationStatus: "unverified",
      healthStatus: "online",
      playersCurrent: 4,
      playersMax: 20,
      version: "1.21.8",
      latencyMs: 42,
      lastCheckedAt: now,
      consecutiveFailures: 0,
    }],
    country: null,
    gameModes: [],
    media: [],
  };
}

test("sends the ownership verification notice to the identity section", () => {
  const verificationNotice = managedServerNotices(makeUnverifiedServer()).find(
    (notice) => notice.id === "server-1:verification",
  );

  assert.equal(verificationNotice?.actionLabel, "Verificar propiedad");
  assert.equal(verificationNotice?.href, "/servers/mi-comunidad/manage#verification");
});

test("uses a fresh Monitor API state for managed server rows", async () => {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  const queries = await import("../src/lib/servers/queries.ts") as {
    applyMonitorStatuses?: (items: ManagedServer[], states: readonly MonitorStatusView[]) => ManagedServer[];
  };

  assert.equal(typeof queries.applyMonitorStatuses, "function");
  if (!queries.applyMonitorStatuses) return;

  const staleServer = makeUnverifiedServer();
  staleServer.aggregateStatus = "unknown";
  staleServer.monitor = {
    ...staleServer.monitor,
    healthStatus: "unknown",
    playersCurrent: null,
    playersMax: null,
    version: null,
    latencyMs: null,
    lastUpdatedAt: new Date("2026-08-23T10:00:00.000Z"),
    freshness: "stale",
  };
  const [refreshedServer] = queries.applyMonitorStatuses([staleServer], [{
    serverId: "server-1",
    healthStatus: "online",
    playersCurrent: 12,
    playersMax: 40,
    version: "1.21.9",
    latencyMs: 31,
    lastCheckedAt: "2026-08-30T10:00:00.000Z",
    lastOnlineAt: "2026-08-30T10:00:00.000Z",
    offlineSince: null,
    lastRecoveredAt: null,
    lastStateChangeAt: "2026-08-30T10:00:00.000Z",
    consecutiveFailures: 0,
    probeEdition: "java",
    cadenceMinutes: 15,
    freshness: "fresh",
  }]);

  assert.equal(refreshedServer?.aggregateStatus, "online");
  assert.equal(refreshedServer?.monitor.healthStatus, "online");
  assert.equal(refreshedServer?.monitor.playersCurrent, 12);
  assert.equal(refreshedServer?.monitor.playersMax, 40);
  assert.equal(refreshedServer?.monitor.version, "1.21.9");
  assert.equal(refreshedServer?.monitor.latencyMs, 31);
  assert.equal(refreshedServer?.monitor.lastUpdatedAt?.toISOString(), "2026-08-30T10:00:00.000Z");
  assert.equal(refreshedServer?.monitor.freshness, "fresh");
});
