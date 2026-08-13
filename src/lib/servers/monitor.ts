import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db, withAdvisoryLock } from "@/db";
import { notificationJobs, monitorRuns, serverEndpoints, serverMembers, servers } from "@/schema";
import { user } from "@/auth-schema";
import { resolveMinecraftTarget, resolveMinecraftBedrockTarget } from "@/lib/minecraft/network";
import { pingJavaServer } from "@/lib/minecraft/ping";
import { pingBedrockServer } from "@/lib/minecraft/bedrock-ping";
import { runMediaCleanup } from "@/lib/media/cleanup";
import { runNotificationOutbox } from "@/lib/notifications";
import {
  applyEndpointObservation,
  classifyProbeError,
  getMonitorSampleSlot,
  prunePlayerHistory,
  type EndpointObservation,
  type MonitorEdition,
  type MonitorSampleStatus,
} from "@/lib/servers/monitor-persistence";

const MAX_ENDPOINTS_PER_RUN = 200;
const MAX_NETWORK_CONCURRENCY = 10;
const MAX_PERSISTENCE_CONCURRENCY = 2;
const MONITOR_LOCK = "opinacraft:endpoint-monitor";
const RUN_TTL_MS = 10 * 60 * 1000;

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Endpoint = {
  serverId: string;
  edition: MonitorEdition;
  host: string;
  port: number;
  historySourceId: string;
};

type ProbeResult = EndpointObservation & {
  probeStatus: "online" | "offline" | "unknown";
};

function pingData(value: unknown) {
  const result = value as {
    latencyMs?: number | null;
    players?: { online?: number; max?: number };
    version?: { name?: string };
  };
  return {
    playersCurrent: Number.isInteger(result.players?.online) && (result.players?.online ?? 0) >= 0 ? result.players?.online ?? null : null,
    playersMax: Number.isInteger(result.players?.max) && (result.players?.max ?? 0) >= 0 ? result.players?.max ?? null : null,
    version: typeof result.version?.name === "string" ? result.version.name.slice(0, 100) : null,
    latencyMs: Number.isInteger(result.latencyMs) && (result.latencyMs ?? 0) >= 0 ? result.latencyMs ?? null : null,
  };
}

async function probeEndpoint(endpoint: Endpoint, runId: string, sampledAt: Date): Promise<ProbeResult> {
  const observedAt = new Date();
  try {
    const result = endpoint.edition === "bedrock"
      ? await resolveMinecraftBedrockTarget(endpoint.host, endpoint.port).then((target) => pingBedrockServer(target))
      : await resolveMinecraftTarget(endpoint.host, endpoint.port).then((target) => pingJavaServer(target));
    const data = pingData(result);
    return {
      serverId: endpoint.serverId,
      edition: endpoint.edition,
      historySourceId: endpoint.historySourceId,
      sampledAt,
      observedAt,
      runId,
      status: "online",
      probeStatus: "online",
      failureCode: null,
      playersCurrent: data.playersCurrent,
      playersMax: data.playersMax,
      version: data.version,
      latencyMs: data.latencyMs,
    };
  } catch (error) {
    const failureCode = classifyProbeError(error);
    const status: MonitorSampleStatus = failureCode === "monitor_error" ? "unknown" : "offline";
    if (failureCode === "monitor_error") {
      console.warn("[monitor] endpoint probe failed", { edition: endpoint.edition, failureCode });
    }
    return {
      serverId: endpoint.serverId,
      edition: endpoint.edition,
      historySourceId: endpoint.historySourceId,
      sampledAt,
      observedAt,
      runId,
      status,
      probeStatus: status,
      failureCode,
      playersCurrent: null,
      playersMax: null,
      version: null,
      latencyMs: null,
    };
  }
}

async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await task(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
}

export type MonitorRunResult = {
  processed: number;
  online: number;
  offline: number;
  unknown: number;
  persistenceFailures: number;
};

export async function runEndpointMonitor() {
  const result = await withAdvisoryLock(MONITOR_LOCK, async (): Promise<MonitorRunResult | null> => {
    const sampledAt = getMonitorSampleSlot();
    const runId = randomUUID();
    const nonce = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + RUN_TTL_MS);
    const processingStartedAt = new Date();
    const endpoints = await db
      .select({
        serverId: serverEndpoints.serverId,
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
        historySourceId: serverEndpoints.historySourceId,
      })
      .from(serverEndpoints)
      .where(eq(serverEndpoints.verificationStatus, "verified"))
      .orderBy(asc(sql`${serverEndpoints.lastCheckedAt} is not null`), asc(serverEndpoints.lastCheckedAt), asc(serverEndpoints.serverId), asc(serverEndpoints.edition))
      .limit(MAX_ENDPOINTS_PER_RUN);

    const [run] = await db
      .insert(monitorRuns)
      .values({
        runId,
        nonce,
        sampledAt,
        expiresAt,
        fallbackEndpoints: [],
        status: "processing",
        processingStartedAt,
      })
      .onConflictDoNothing({ target: monitorRuns.sampledAt })
      .returning({ runId: monitorRuns.runId });
    if (!run) return null;

    const probes: ProbeResult[] = [];
    await runPool(endpoints, MAX_NETWORK_CONCURRENCY, async (endpoint) => {
      probes.push(await probeEndpoint(endpoint, runId, sampledAt));
    });

    let persistenceFailures = 0;
    let javaPersistenceFailures = 0;
    let bedrockPersistenceFailures = 0;
    await runPool(probes, MAX_PERSISTENCE_CONCURRENCY, async (observation) => {
      try {
        await db.transaction((tx) => applyEndpointObservation(tx, observation));
      } catch (error) {
        persistenceFailures += 1;
        if (observation.edition === "java") javaPersistenceFailures += 1;
        else bedrockPersistenceFailures += 1;
        console.error("[monitor] observation persistence failed", {
          edition: observation.edition,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    });

    const status = persistenceFailures ? "partial" : "done";
    const completedAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(monitorRuns)
        .set({
          status,
          processingStartedAt,
          completedAt,
          javaPersistenceFailures,
          bedrockPersistenceFailures,
        })
        .where(eq(monitorRuns.runId, runId));
    });
    try {
      await db.transaction(async (tx) => {
        await updateAvailabilityVisibility(tx);
        await prunePlayerHistory(tx);
      });
    } catch (error) {
      console.error("[monitor] secondary maintenance failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }

    return {
      processed: probes.length,
      online: probes.filter((probe) => probe.probeStatus === "online").length,
      offline: probes.filter((probe) => probe.probeStatus === "offline").length,
      unknown: probes.filter((probe) => probe.probeStatus === "unknown").length,
      persistenceFailures,
    };
  });

  if (result) {
    await runMediaCleanup();
    await runNotificationOutbox();
  }
  return result;
}

export async function updateAvailabilityVisibility(tx: DatabaseTransaction) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const candidates = await tx.select({ id: servers.id }).from(servers).where(and(eq(servers.publicationStatus, "published"), eq(servers.moderationStatus, "active")));
  for (const server of candidates) {
    const rows = await tx
      .select({ healthStatus: serverEndpoints.healthStatus, lastCheckedAt: serverEndpoints.lastCheckedAt, lastOnlineAt: serverEndpoints.lastOnlineAt })
      .from(serverEndpoints)
      .where(and(eq(serverEndpoints.serverId, server.id), eq(serverEndpoints.verificationStatus, "verified")));
    if (!rows.length) continue;
    const fresh = rows.filter((row) => row.lastCheckedAt && row.lastCheckedAt >= staleCutoff);
    const allOffline = fresh.length === rows.length && rows.every((row) => row.healthStatus === "offline");
    const sevenDaysOffline = rows.every((row) => !row.lastOnlineAt || row.lastOnlineAt <= cutoff);
    if (allOffline && sevenDaysOffline) {
      const [changed] = await tx
        .update(servers)
        .set({ availabilityHiddenAt: sql`coalesce(${servers.availabilityHiddenAt}, now())` })
        .where(and(eq(servers.id, server.id), isNull(servers.availabilityHiddenAt)))
        .returning({ id: servers.id, hiddenAt: servers.availabilityHiddenAt });
      if (changed) await enqueueAvailabilityNotification(tx, server.id, "hidden", changed.hiddenAt);
    } else if (rows.some((row) => row.healthStatus === "online")) {
      const [changed] = await tx
        .update(servers)
        .set({ availabilityHiddenAt: null })
        .where(and(eq(servers.id, server.id), sql`${servers.availabilityHiddenAt} is not null`))
        .returning({ id: servers.id });
      if (changed) await enqueueAvailabilityNotification(tx, server.id, "restored");
    }
  }
}

async function enqueueAvailabilityNotification(tx: DatabaseTransaction, serverId: string, transition: "hidden" | "restored", marker?: Date | null) {
  const [owner] = await tx
    .select({ userId: serverMembers.userId, email: user.email })
    .from(serverMembers)
    .innerJoin(user, eq(serverMembers.userId, user.id))
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.role, "owner")))
    .limit(1);
  if (!owner?.email) return;
  const markerKey = marker?.toISOString() ?? new Date().toISOString().slice(0, 10);
  await tx.insert(notificationJobs).values({
    dedupeKey: `availability:${serverId}:${transition}:${markerKey}`,
    recipientUserId: owner.userId,
    recipientEmail: owner.email,
    template: `availability_${transition}`,
    payload: { serverId, transition },
  }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
}
