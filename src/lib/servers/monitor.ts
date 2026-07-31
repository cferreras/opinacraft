import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { notificationJobs, serverEndpoints, serverMembers, servers } from "@/schema";
import { user } from "@/auth-schema";
import { resolveMinecraftTarget, resolveMinecraftBedrockTarget } from "@/lib/minecraft/network";
import { MinecraftOfflineError, MinecraftResponseError, MinecraftTimeoutError, pingJavaServer } from "@/lib/minecraft/ping";
import { BedrockOfflineError, pingBedrockServer } from "@/lib/minecraft/bedrock-ping";
import { runMediaCleanup } from "@/lib/media/cleanup";
import { runNotificationOutbox } from "@/lib/notifications";

const MAX_ENDPOINTS_PER_RUN = 200;
const MAX_CONCURRENCY = 10;
const FAILURE_THRESHOLD = 3;
const MONITOR_LOCK = "opinacraft:endpoint-monitor";
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Endpoint = {
  serverId: string;
  edition: "java" | "bedrock";
  host: string;
  port: number;
  healthStatus: "unknown" | "online" | "offline";
  consecutiveFailures: number;
};

function pingData(value: unknown) {
  const result = value as { players?: { online?: number; max?: number }; version?: { name?: string } };
  return {
    playersCurrent: Number.isInteger(result.players?.online) ? result.players?.online ?? null : null,
    playersMax: Number.isInteger(result.players?.max) ? result.players?.max ?? null : null,
    version: typeof result.version?.name === "string" ? result.version.name.slice(0, 100) : null,
  };
}

async function checkEndpoint(tx: DatabaseTransaction, endpoint: Endpoint) {
  const startedAt = Date.now();
  try {
    const result = endpoint.edition === "bedrock"
      ? await resolveMinecraftBedrockTarget(endpoint.host, endpoint.port).then((target) => pingBedrockServer(target))
      : await resolveMinecraftTarget(endpoint.host, endpoint.port).then((target) => pingJavaServer(target));
    const data = pingData(result);
    await tx.update(serverEndpoints).set({ healthStatus: "online", playersCurrent: data.playersCurrent, playersMax: data.playersMax, version: data.version, latencyMs: Date.now() - startedAt, lastCheckedAt: new Date(), lastOnlineAt: new Date(), consecutiveFailures: 0 }).where(and(eq(serverEndpoints.serverId, endpoint.serverId), eq(serverEndpoints.edition, endpoint.edition)));
    if (endpoint.healthStatus === "offline") await enqueueEndpointNotification(tx, endpoint.serverId, endpoint.edition, "recovered");
    return "online" as const;
  } catch (error) {
    const failures = endpoint.consecutiveFailures + 1;
    await tx.update(serverEndpoints).set({ healthStatus: failures >= FAILURE_THRESHOLD ? "offline" : endpoint.healthStatus, lastCheckedAt: new Date(), consecutiveFailures: failures, latencyMs: null }).where(and(eq(serverEndpoints.serverId, endpoint.serverId), eq(serverEndpoints.edition, endpoint.edition)));
    if (failures >= FAILURE_THRESHOLD && endpoint.healthStatus !== "offline") await enqueueEndpointNotification(tx, endpoint.serverId, endpoint.edition, "down");
    if (!(error instanceof MinecraftOfflineError || error instanceof MinecraftResponseError || error instanceof MinecraftTimeoutError || error instanceof BedrockOfflineError)) {
      console.warn("[monitor] endpoint check failed", error instanceof Error ? error.name : "unknown");
    }
    return "offline" as const;
  }
}

async function enqueueEndpointNotification(tx: DatabaseTransaction, serverId: string, edition: "java" | "bedrock", transition: "down" | "recovered") {
  const [owner] = await tx.select({ userId: serverMembers.userId, email: user.email }).from(serverMembers).innerJoin(user, eq(serverMembers.userId, user.id)).where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.role, "owner"))).limit(1);
  if (!owner?.email) return;
  await tx.insert(notificationJobs).values({ dedupeKey: `endpoint:${serverId}:${edition}:${transition}:${new Date().toISOString().slice(0, 10)}`, recipientUserId: owner.userId, recipientEmail: owner.email, template: `endpoint_${transition}`, payload: { serverId, edition, transition } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
}

async function withMonitorLock<T>(operation: (tx: DatabaseTransaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${MONITOR_LOCK})) as acquired`);
    if (!Boolean((rows as unknown as Array<{ acquired?: boolean }>)[0]?.acquired)) return null;
    return operation(tx);
  });
}

export async function runEndpointMonitor() {
  const result = await withMonitorLock(async (tx) => {
    const endpoints = await tx.select({ serverId: serverEndpoints.serverId, edition: serverEndpoints.edition, host: serverEndpoints.host, port: serverEndpoints.port, healthStatus: serverEndpoints.healthStatus, consecutiveFailures: serverEndpoints.consecutiveFailures }).from(serverEndpoints).where(eq(serverEndpoints.verificationStatus, "verified")).orderBy(asc(sql`${serverEndpoints.lastCheckedAt} is not null`), asc(serverEndpoints.lastCheckedAt), asc(serverEndpoints.serverId), asc(serverEndpoints.edition)).limit(MAX_ENDPOINTS_PER_RUN);
    let cursor = 0;
    let online = 0;
    let offline = 0;
    let skipped = 0;
    async function worker() {
      while (cursor < endpoints.length) {
        const endpoint = endpoints[cursor++];
        const result = await checkEndpoint(tx, endpoint);
        if (result === "online") online += 1;
        else if (result === "offline") offline += 1;
        else skipped += 1;
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, endpoints.length) }, () => worker()));
    await updateAvailabilityVisibility(tx);
    return { processed: endpoints.length, online, offline, skipped, fallback: endpoints.filter((endpoint) => endpoint.edition === "bedrock").map((endpoint) => ({ serverId: endpoint.serverId, edition: endpoint.edition, host: endpoint.host, port: endpoint.port })) };
  });
  if (result) {
    await runMediaCleanup();
    await runNotificationOutbox();
  }
  return result;
}

async function updateAvailabilityVisibility(tx: DatabaseTransaction) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const candidates = await tx.select({ id: servers.id }).from(servers).where(and(eq(servers.publicationStatus, "published"), eq(servers.moderationStatus, "active")));
  for (const server of candidates) {
    const rows = await tx.select({ healthStatus: serverEndpoints.healthStatus, lastCheckedAt: serverEndpoints.lastCheckedAt, lastOnlineAt: serverEndpoints.lastOnlineAt }).from(serverEndpoints).where(and(eq(serverEndpoints.serverId, server.id), eq(serverEndpoints.verificationStatus, "verified")));
    if (!rows.length) continue;
    const fresh = rows.filter((row) => row.lastCheckedAt && row.lastCheckedAt >= staleCutoff);
    const allOffline = fresh.length === rows.length && rows.every((row) => row.healthStatus === "offline");
    const sevenDaysOffline = rows.every((row) => !row.lastOnlineAt || row.lastOnlineAt <= cutoff) && rows.every((row) => row.lastCheckedAt && row.lastCheckedAt <= cutoff);
    if (allOffline && sevenDaysOffline) {
      const [changed] = await tx.update(servers).set({ availabilityHiddenAt: sql`coalesce(${servers.availabilityHiddenAt}, now())` }).where(and(eq(servers.id, server.id), isNull(servers.availabilityHiddenAt))).returning({ id: servers.id, hiddenAt: servers.availabilityHiddenAt });
      if (changed) await enqueueAvailabilityNotification(tx, server.id, "hidden", changed.hiddenAt);
    } else if (rows.some((row) => row.healthStatus === "online")) {
      const [changed] = await tx.update(servers).set({ availabilityHiddenAt: null }).where(and(eq(servers.id, server.id), sql`${servers.availabilityHiddenAt} is not null`)).returning({ id: servers.id });
      if (changed) await enqueueAvailabilityNotification(tx, server.id, "restored");
    }
  }
}

async function enqueueAvailabilityNotification(tx: DatabaseTransaction, serverId: string, transition: "hidden" | "restored", marker?: Date | null) {
  const [owner] = await tx.select({ userId: serverMembers.userId, email: user.email }).from(serverMembers).innerJoin(user, eq(serverMembers.userId, user.id)).where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.role, "owner"))).limit(1);
  if (!owner?.email) return;
  const markerKey = marker?.toISOString() ?? new Date().toISOString().slice(0, 10);
  await tx.insert(notificationJobs).values({ dedupeKey: `availability:${serverId}:${transition}:${markerKey}`, recipientUserId: owner.userId, recipientEmail: owner.email, template: `availability_${transition}`, payload: { serverId, transition } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
}
