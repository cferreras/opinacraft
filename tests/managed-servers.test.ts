import assert from "node:assert/strict";
import test from "node:test";

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
