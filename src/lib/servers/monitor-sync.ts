import { and, eq, lte, lt, or } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db } from "@/db";
import { monitorSyncOutbox, serverEndpoints, serverNetworkTargets, servers } from "@/schema";
import { getMonitorCadenceMinutes } from "./monitor-scheduling";
import { fetchMonitorTargetIds, isMonitorApiConfigured, removeMonitorTarget, syncMonitorTarget } from "./monitor-api-client";
import type { MonitorTarget } from "@/lib/monitor/repository";

type SyncOperation = "upsert" | "delete";

async function readMonitorTarget(serverId: string): Promise<MonitorTarget | null> {
  const [[server], [networkTarget], endpoints] = await Promise.all([
    db.select({
      id: servers.id,
      updatedAt: servers.updatedAt,
      publicationStatus: servers.publicationStatus,
      moderationStatus: servers.moderationStatus,
      availabilityHiddenAt: servers.availabilityHiddenAt,
      verificationStatus: servers.verificationStatus,
    }).from(servers).where(eq(servers.id, serverId)).limit(1),
    db.select({ host: serverNetworkTargets.host }).from(serverNetworkTargets).where(eq(serverNetworkTargets.serverId, serverId)).limit(1),
    db.select({
      edition: serverEndpoints.edition,
      historySourceId: serverEndpoints.historySourceId,
      host: serverEndpoints.host,
      port: serverEndpoints.port,
      verificationStatus: serverEndpoints.verificationStatus,
    }).from(serverEndpoints).where(eq(serverEndpoints.serverId, serverId)),
  ]);
  if (!server) return null;
  const networkHost = networkTarget?.host ?? endpoints[0]?.host;
  if (!networkHost) return null;
  const cadenceMinutes = getMonitorCadenceMinutes({
    publicationStatus: server.publicationStatus,
    moderationStatus: server.moderationStatus,
    availabilityHiddenAt: server.availabilityHiddenAt,
    hasVerifiedEndpoint: endpoints.some((endpoint) => endpoint.verificationStatus === "verified"),
  }) ?? 60;
  const sourceVersionValue = [
    server.updatedAt.toISOString(),
    server.verificationStatus,
    ...endpoints.map((endpoint) => `${endpoint.edition}:${endpoint.host}:${endpoint.port}:${endpoint.verificationStatus}:${endpoint.historySourceId}`),
  ].join("|");
  const sourceVersion = sourceVersionValue.length <= 512
    ? sourceVersionValue
    : createHash("sha256").update(sourceVersionValue).digest("hex");
  return {
    serverId,
    sourceVersion,
    publicationStatus: server.publicationStatus,
    moderationStatus: server.moderationStatus,
    availabilityHiddenAt: server.availabilityHiddenAt,
    networkHost,
    cadenceMinutes: cadenceMinutes as 15 | 60,
    endpoints: endpoints.map((endpoint) => ({
      edition: endpoint.edition,
      historySourceId: endpoint.historySourceId,
      host: endpoint.host,
      port: endpoint.port,
      verificationStatus: endpoint.verificationStatus,
    })),
  };
}

export async function syncServerToMonitor(serverId: string, operation: SyncOperation = "upsert") {
  if (!isMonitorApiConfigured()) return { configured: false, synced: false };
  if (operation === "delete") {
    await removeMonitorTarget(serverId);
    return { configured: true, synced: true };
  }
  const target = await readMonitorTarget(serverId);
  if (!target) {
    await removeMonitorTarget(serverId);
    return { configured: true, synced: true, removed: true };
  }
  await syncMonitorTarget(target);
  return { configured: true, synced: true };
}

async function claimOutbox(limit: number, serverId?: string) {
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.update(monitorSyncOutbox)
      .set({ status: "pending" })
      .where(and(eq(monitorSyncOutbox.status, "processing"), lt(monitorSyncOutbox.nextAttemptAt, new Date(now.getTime() - 15 * 60_000))));
    const rows = await tx.select().from(monitorSyncOutbox).where(and(
      or(eq(monitorSyncOutbox.status, "pending"), eq(monitorSyncOutbox.status, "failed")),
      lte(monitorSyncOutbox.nextAttemptAt, now),
      serverId ? eq(monitorSyncOutbox.serverId, serverId) : undefined,
    )).orderBy(monitorSyncOutbox.createdAt).limit(limit).for("update", { skipLocked: true });
    for (const row of rows) {
      await tx.update(monitorSyncOutbox).set({ status: "processing", attempts: row.attempts + 1 }).where(eq(monitorSyncOutbox.id, row.id));
    }
    return rows;
  });
}

export async function processMonitorSyncOutbox({ limit = 25, serverId }: { limit?: number; serverId?: string } = {}) {
  if (!isMonitorApiConfigured()) return { configured: false, processed: 0, failed: 0 };
  const rows = await claimOutbox(limit, serverId);
  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await syncServerToMonitor(row.serverId, row.operation as SyncOperation);
      await db.update(monitorSyncOutbox).set({ status: "done", processedAt: new Date(), lastError: null }).where(eq(monitorSyncOutbox.id, row.id));
      processed += 1;
    } catch (error) {
      failed += 1;
      const attempts = row.attempts + 1;
      await db.update(monitorSyncOutbox).set({
        status: attempts >= 10 ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + Math.min(6 * 60 * 60_000, 2 ** Math.min(attempts, 8) * 60_000)),
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Monitor sync failed.",
      }).where(eq(monitorSyncOutbox.id, row.id));
    }
  }
  return { configured: true, processed, failed };
}

export async function reconcileMonitorTargets(limit = 1_000) {
  if (!isMonitorApiConfigured()) return { configured: false, synced: 0, failed: 0 };
  const [rows, monitorTargetIds] = await Promise.all([
    db.select({ id: servers.id }).from(servers).limit(limit),
    fetchMonitorTargetIds(),
  ]);
  if (!monitorTargetIds) return { configured: true, synced: 0, failed: 1 };
  let synced = 0;
  let failed = 0;
  const serverIds = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    try {
      await syncServerToMonitor(row.id);
      synced += 1;
    } catch (error) {
      failed += 1;
      console.error("[monitor] reconciliation failed", row.id, error instanceof Error ? error.name : "unknown");
    }
  }
  for (const serverId of monitorTargetIds) {
    if (serverIds.has(serverId)) continue;
    try {
      await removeMonitorTarget(serverId);
      synced += 1;
    } catch (error) {
      failed += 1;
      console.error("[monitor] orphan reconciliation failed", serverId, error instanceof Error ? error.name : "unknown");
    }
  }
  return { configured: true, synced, failed };
}
