import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import {
  notificationJobs,
  serverMembers,
  serverMonitorJobs,
  serverPlayerHourly,
  serverPlayerSnapshots,
  servers,
} from "@/schema";
import type { CanonicalMonitorObservation } from "./monitor-worker-core";
import { getAvailabilityTransition, type AvailabilityTransition } from "./monitor-availability";
import { getMonitorNotificationDedupeKey } from "./monitor-persistence-helpers";

const FAILURE_THRESHOLD = 3;
const RAW_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const HOURLY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH_SIZE = 5_000;
const PRUNE_MAX_ROWS_PER_RUN = 20_000;

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function getHourlyBucket(date: Date) {
  const value = new Date(date);
  value.setUTCMinutes(0, 0, 0);
  return value;
}

function hasPlayerValue(observation: CanonicalMonitorObservation) {
  return observation.status === "online" && Number.isInteger(observation.playersCurrent) && (observation.playersCurrent ?? 0) >= 0;
}

function hasCapacityValue(observation: CanonicalMonitorObservation) {
  return hasPlayerValue(observation) && Number.isInteger(observation.playersMax) && (observation.playersMax ?? 0) >= 0;
}

function occupancyBasisPoints(observation: CanonicalMonitorObservation) {
  if (!hasCapacityValue(observation) || (observation.playersMax ?? 0) <= 0) return null;
  return Math.max(0, Math.min(10_000, Math.round(((observation.playersCurrent ?? 0) / (observation.playersMax ?? 1)) * 10_000)));
}

async function upsertCanonicalHourly(tx: DatabaseTransaction, observation: CanonicalMonitorObservation) {
  const bucketStart = getHourlyBucket(observation.scheduledAt);
  const playersCurrent = hasPlayerValue(observation) ? observation.playersCurrent ?? 0 : null;
  const playersMax = hasCapacityValue(observation) ? observation.playersMax ?? 0 : null;
  const occupancy = occupancyBasisPoints(observation);

  await tx.insert(serverPlayerHourly).values({
    serverId: observation.serverId,
    bucketStart,
    lastProbeEdition: observation.probeEdition,
    sourceChanged: 0,
    sampleCount: 1,
    onlineCount: observation.status === "online" ? 1 : 0,
    unknownCount: observation.status === "unknown" ? 1 : 0,
    playerDataCount: playersCurrent === null ? 0 : 1,
    playersTotal: playersCurrent ?? 0,
    playersPeak: playersCurrent,
    capacityDataCount: playersMax === null ? 0 : 1,
    capacityTotal: playersMax ?? 0,
    capacityLatest: playersMax,
    occupancyDataCount: occupancy === null ? 0 : 1,
    occupancyBasisPointsTotal: occupancy ?? 0,
    lastObservedAt: observation.observedAt,
  }).onConflictDoUpdate({
    target: [serverPlayerHourly.serverId, serverPlayerHourly.bucketStart],
    set: {
      lastProbeEdition: observation.probeEdition,
      sourceChanged: sql`case when ${serverPlayerHourly.sourceChanged} = 1 then 1 when ${serverPlayerHourly.lastProbeEdition} is not null and ${serverPlayerHourly.lastProbeEdition} <> ${observation.probeEdition} then 1 else ${serverPlayerHourly.sourceChanged} end`,
      sampleCount: sql`${serverPlayerHourly.sampleCount} + 1`,
      onlineCount: observation.status === "online" ? sql`${serverPlayerHourly.onlineCount} + 1` : serverPlayerHourly.onlineCount,
      unknownCount: observation.status === "unknown" ? sql`${serverPlayerHourly.unknownCount} + 1` : serverPlayerHourly.unknownCount,
      playerDataCount: playersCurrent === null ? serverPlayerHourly.playerDataCount : sql`${serverPlayerHourly.playerDataCount} + 1`,
      playersTotal: playersCurrent === null ? serverPlayerHourly.playersTotal : sql`${serverPlayerHourly.playersTotal} + ${playersCurrent}`,
      playersPeak: playersCurrent === null ? serverPlayerHourly.playersPeak : sql`greatest(coalesce(${serverPlayerHourly.playersPeak}, 0), ${playersCurrent})`,
      capacityDataCount: playersMax === null ? serverPlayerHourly.capacityDataCount : sql`${serverPlayerHourly.capacityDataCount} + 1`,
      capacityTotal: playersMax === null ? serverPlayerHourly.capacityTotal : sql`${serverPlayerHourly.capacityTotal} + ${playersMax}`,
      capacityLatest: playersMax === null ? serverPlayerHourly.capacityLatest : playersMax,
      occupancyDataCount: occupancy === null ? serverPlayerHourly.occupancyDataCount : sql`${serverPlayerHourly.occupancyDataCount} + 1`,
      occupancyBasisPointsTotal: occupancy === null ? serverPlayerHourly.occupancyBasisPointsTotal : sql`${serverPlayerHourly.occupancyBasisPointsTotal} + ${occupancy}`,
      lastObservedAt: sql`greatest(coalesce(${serverPlayerHourly.lastObservedAt}, ${observation.observedAt}), ${observation.observedAt})`,
    },
  });
}

export async function applyCanonicalObservation(
  tx: DatabaseTransaction,
  observation: CanonicalMonitorObservation,
  jobId?: string,
) {
  const [current] = await tx.select({
    healthStatus: servers.monitorHealthStatus,
    consecutiveFailures: servers.monitorConsecutiveFailures,
    lastCheckedAt: servers.monitorLastCheckedAt,
  }).from(servers).where(eq(servers.id, observation.serverId)).for("update").limit(1);

  if (!current) throw new Error("Server not found for monitor observation.");

  const [inserted] = await tx.insert(serverPlayerSnapshots).values({
    serverId: observation.serverId,
    scheduledAt: observation.scheduledAt,
    observedAt: observation.observedAt,
    probeEdition: observation.probeEdition,
    status: observation.status,
    failureCode: observation.failureCode ?? null,
    playersCurrent: hasPlayerValue(observation) ? observation.playersCurrent : null,
    playersMax: hasCapacityValue(observation) ? observation.playersMax : null,
    version: observation.version,
    latencyMs: observation.latencyMs,
    jobId: jobId ?? null,
  }).onConflictDoNothing().returning({ serverId: serverPlayerSnapshots.serverId });

  if (!inserted) return { persisted: false, duplicate: true, transition: null as "down" | "recovered" | null };
  await upsertCanonicalHourly(tx, observation);

  if (current.lastCheckedAt && current.lastCheckedAt > observation.observedAt) {
    return { persisted: true, duplicate: false, transition: null as "down" | "recovered" | null };
  }

  let transition: "down" | "recovered" | null = null;
  if (observation.status === "online") {
    if (current.healthStatus === "offline") transition = "recovered";
    await tx.update(servers).set({
      monitorHealthStatus: "online",
      monitorPlayersCurrent: hasPlayerValue(observation) ? observation.playersCurrent : null,
      monitorPlayersMax: hasCapacityValue(observation) ? observation.playersMax : null,
      monitorVersion: observation.version,
      monitorLatencyMs: observation.latencyMs,
      monitorLastCheckedAt: observation.observedAt,
      monitorLastOnlineAt: observation.observedAt,
      monitorConsecutiveFailures: 0,
      monitorProbeEdition: observation.probeEdition,
    }).where(eq(servers.id, observation.serverId));
  } else if (observation.status === "offline") {
    const consecutiveFailures = current.consecutiveFailures + 1;
    const healthStatus = consecutiveFailures >= FAILURE_THRESHOLD ? "offline" as const : current.healthStatus;
    if (healthStatus === "offline" && current.healthStatus !== "offline") transition = "down";
    await tx.update(servers).set({
      monitorHealthStatus: healthStatus,
      monitorPlayersCurrent: null,
      monitorPlayersMax: null,
      monitorVersion: null,
      monitorLatencyMs: null,
      monitorLastCheckedAt: observation.observedAt,
      monitorConsecutiveFailures: consecutiveFailures,
      monitorProbeEdition: observation.probeEdition,
    }).where(eq(servers.id, observation.serverId));
  } else {
    await tx.update(servers).set({
      monitorHealthStatus: "unknown",
      monitorPlayersCurrent: null,
      monitorPlayersMax: null,
      monitorVersion: null,
      monitorLatencyMs: null,
      monitorLastCheckedAt: observation.observedAt,
      monitorProbeEdition: observation.probeEdition,
    }).where(eq(servers.id, observation.serverId));
  }

  if (transition) await enqueueServerNotification(tx, observation.serverId, transition, observation.probeEdition, observation.observedAt);
  return { persisted: true, duplicate: false, transition };
}

async function enqueueServerNotification(tx: DatabaseTransaction, serverId: string, transition: "down" | "recovered", edition: "java" | "bedrock", observedAt: Date) {
  const [owner] = await tx.select({ userId: serverMembers.userId, email: user.email })
    .from(serverMembers)
    .innerJoin(user, eq(serverMembers.userId, user.id))
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.role, "owner")))
    .limit(1);
  if (!owner?.email) return;
  await tx.insert(notificationJobs).values({
    dedupeKey: getMonitorNotificationDedupeKey(serverId, transition, observedAt),
    recipientUserId: owner.userId,
    recipientEmail: owner.email,
    template: transition === "down" ? "endpoint_down" : "endpoint_recovered",
    payload: { serverId, edition, transition },
  }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
}

export async function markMonitorJobDone(tx: DatabaseTransaction, jobId: string, observedAt: Date, workerId?: string) {
  await tx.update(serverMonitorJobs).set({
    status: "done",
    observedAt,
    completedAt: new Date(),
    leaseOwner: null,
    leaseUntil: null,
    lastError: null,
  }).where(and(
    eq(serverMonitorJobs.id, jobId),
    eq(serverMonitorJobs.status, "processing"),
    workerId ? eq(serverMonitorJobs.leaseOwner, workerId) : undefined,
  ));
}

export async function updateCanonicalAvailability(tx: DatabaseTransaction, now = new Date()) {
  const rows = await tx.select({
    id: servers.id,
    publicationStatus: servers.publicationStatus,
    moderationStatus: servers.moderationStatus,
    availabilityHiddenAt: servers.availabilityHiddenAt,
    createdAt: servers.createdAt,
    healthStatus: servers.monitorHealthStatus,
    lastCheckedAt: servers.monitorLastCheckedAt,
    lastOnlineAt: servers.monitorLastOnlineAt,
  }).from(servers).where(and(
    eq(servers.publicationStatus, "published"),
    eq(servers.moderationStatus, "active"),
    sql`${servers.monitorLastCheckedAt} is not null and ${servers.monitorLastCheckedAt} >= now() - (case when ${servers.availabilityHiddenAt} is null then interval '30 minutes' else interval '120 minutes' end)`,
  ));

  const transitions = new Map<string, AvailabilityTransition>();
  for (const row of rows) {
    const transition = getAvailabilityTransition(row, now);
    if (transition) transitions.set(row.id, transition);
  }
  const hiddenIds = [...transitions.entries()].filter(([, transition]) => transition === "hidden").map(([id]) => id);
  const restoredIds = [...transitions.entries()].filter(([, transition]) => transition === "restored").map(([id]) => id);

  if (hiddenIds.length) {
    await tx.update(servers).set({ availabilityHiddenAt: now }).where(inArray(servers.id, hiddenIds));
  }
  if (restoredIds.length) {
    await tx.update(servers).set({ availabilityHiddenAt: null }).where(inArray(servers.id, restoredIds));
  }

  const changedIds = [...transitions.keys()];
  if (!changedIds.length) return { hidden: 0, restored: 0 };

  const owners = await tx.select({
    serverId: serverMembers.serverId,
    userId: serverMembers.userId,
    email: user.email,
  }).from(serverMembers)
    .innerJoin(user, eq(serverMembers.userId, user.id))
    .where(and(
      inArray(serverMembers.serverId, changedIds),
      eq(serverMembers.role, "owner"),
    ));
  if (owners.length) {
    await tx.insert(notificationJobs).values(owners.map((owner) => {
      const transition = transitions.get(owner.serverId)!;
      return {
        dedupeKey: `availability:${owner.serverId}:${transition}:${now.toISOString().slice(0, 10)}`,
        recipientUserId: owner.userId,
        recipientEmail: owner.email,
        template: `availability_${transition}`,
        payload: { serverId: owner.serverId, transition },
      };
    })).onConflictDoNothing({ target: notificationJobs.dedupeKey });
  }

  return { hidden: hiddenIds.length, restored: restoredIds.length };
}

export async function pruneCanonicalPlayerHistory(tx: DatabaseTransaction, now = new Date()) {
  const rawCutoff = new Date(now.getTime() - RAW_RETENTION_MS);
  const hourlyCutoff = new Date(now.getTime() - HOURLY_RETENTION_MS);
  let remaining = PRUNE_MAX_ROWS_PER_RUN;

  for (const [table, cutoff] of [
    ["server_player_snapshots", rawCutoff],
    ["server_player_hourly", hourlyCutoff],
  ] as const) {
    while (remaining > 0) {
      const batchSize = Math.min(PRUNE_BATCH_SIZE, remaining);
      const result = table === "server_player_snapshots"
        ? await tx.execute(sql`
            with doomed as (
              select ctid
              from server_player_snapshots
              where scheduled_at < ${cutoff}
              limit ${batchSize}
            )
            delete from server_player_snapshots s
            using doomed
            where s.ctid = doomed.ctid
          `)
        : await tx.execute(sql`
            with doomed as (
              select ctid
              from server_player_hourly
              where bucket_start < ${cutoff}
              limit ${batchSize}
            )
            delete from server_player_hourly h
            using doomed
            where h.ctid = doomed.ctid
          `);
      const deleted = Number((result as { rowCount?: number }).rowCount ?? 0);
      remaining -= deleted;
      if (deleted < batchSize) break;
    }
    if (remaining === 0) break;
  }
}
