import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import {
  monitorRuns,
  notificationJobs,
  serverEndpointPlayerHourly,
  serverEndpointPlayerSnapshots,
  serverEndpoints,
  serverMembers,
} from "@/schema";
import { MinecraftOfflineError, MinecraftResponseError, MinecraftTimeoutError } from "@/lib/minecraft/ping";
import { BedrockOfflineError } from "@/lib/minecraft/bedrock-ping";
import { BlockedMinecraftTargetError, MinecraftDnsError } from "@/lib/minecraft/network";

const FAILURE_THRESHOLD = 3;
const RAW_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const HOURLY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH_SIZE = 5_000;

export type MonitorEdition = "java" | "bedrock";
export type MonitorSampleStatus = "unknown" | "online" | "offline";
export type MonitorFailureCode =
  | "unreachable"
  | "timeout"
  | "invalid_response"
  | "dns_error"
  | "blocked_target"
  | "monitor_error";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EndpointObservation = {
  serverId: string;
  edition: MonitorEdition;
  historySourceId: string;
  sampledAt: Date;
  observedAt: Date;
  runId: string;
  status: MonitorSampleStatus;
  failureCode?: MonitorFailureCode | null;
  playersCurrent?: number | null;
  playersMax?: number | null;
  version?: string | null;
  latencyMs?: number | null;
};

export type ObservationResult = {
  persisted: boolean;
  duplicate: boolean;
  currentUpdated: boolean;
  sourceChanged: boolean;
  transition: "down" | "recovered" | null;
};

export function getMonitorSampleSlot(date = new Date()) {
  const value = new Date(date);
  value.setUTCMinutes(Math.floor(value.getUTCMinutes() / 15) * 15, 0, 0);
  return value;
}

export function getHourlyBucket(date: Date) {
  const value = new Date(date);
  value.setUTCMinutes(0, 0, 0);
  return value;
}

export function classifyProbeError(error: unknown): MonitorFailureCode {
  if (error instanceof BlockedMinecraftTargetError) return "blocked_target";
  if (error instanceof MinecraftDnsError) return "dns_error";
  if (error instanceof MinecraftTimeoutError) return "timeout";
  if (error instanceof MinecraftResponseError) return "invalid_response";
  if (error instanceof MinecraftOfflineError || error instanceof BedrockOfflineError) return "unreachable";
  return "monitor_error";
}

function hasPlayerValue(observation: EndpointObservation) {
  return observation.status === "online" && Number.isInteger(observation.playersCurrent) && (observation.playersCurrent ?? 0) >= 0;
}

function hasCapacityValue(observation: EndpointObservation) {
  return hasPlayerValue(observation) && Number.isInteger(observation.playersMax) && (observation.playersMax ?? 0) >= 0;
}

function occupancyBasisPoints(observation: EndpointObservation) {
  if (!hasCapacityValue(observation) || (observation.playersMax ?? 0) <= 0) return null;
  return Math.max(0, Math.min(10_000, Math.round(((observation.playersCurrent ?? 0) / (observation.playersMax ?? 1)) * 10_000)));
}

export async function upsertHourlyPlayerRollup(tx: DatabaseTransaction, observation: EndpointObservation) {
  const bucketStart = getHourlyBucket(observation.sampledAt);
  const playerValue = hasPlayerValue(observation) ? observation.playersCurrent ?? 0 : null;
  const capacityValue = hasCapacityValue(observation) ? observation.playersMax ?? 0 : null;
  const occupancyValue = occupancyBasisPoints(observation);
  await tx
    .insert(serverEndpointPlayerHourly)
    .values({
      serverId: observation.serverId,
      edition: observation.edition,
      bucketStart,
      lastSourceId: observation.historySourceId,
      sourceChanged: 0,
      sampleCount: 1,
      onlineCount: observation.status === "online" ? 1 : 0,
      unknownCount: observation.status === "unknown" ? 1 : 0,
      playerDataCount: playerValue === null ? 0 : 1,
      playersTotal: playerValue ?? 0,
      playersPeak: playerValue,
      capacityDataCount: capacityValue === null ? 0 : 1,
      capacityTotal: capacityValue ?? 0,
      capacityLatest: capacityValue,
      occupancyDataCount: occupancyValue === null ? 0 : 1,
      occupancyBasisPointsTotal: occupancyValue ?? 0,
      lastSampleAt: observation.sampledAt,
    })
    .onConflictDoUpdate({
      target: [serverEndpointPlayerHourly.serverId, serverEndpointPlayerHourly.edition, serverEndpointPlayerHourly.bucketStart],
      set: {
        lastSourceId: sql`case when ${serverEndpointPlayerHourly.lastSampleAt} is null or ${serverEndpointPlayerHourly.lastSampleAt} <= ${observation.sampledAt} then ${observation.historySourceId} else ${serverEndpointPlayerHourly.lastSourceId} end`,
        sourceChanged: sql`case when ${serverEndpointPlayerHourly.lastSourceId} is not null and ${serverEndpointPlayerHourly.lastSourceId} <> ${observation.historySourceId} then 1 else ${serverEndpointPlayerHourly.sourceChanged} end`,
        sampleCount: sql`${serverEndpointPlayerHourly.sampleCount} + 1`,
        onlineCount: observation.status === "online" ? sql`${serverEndpointPlayerHourly.onlineCount} + 1` : serverEndpointPlayerHourly.onlineCount,
        unknownCount: observation.status === "unknown" ? sql`${serverEndpointPlayerHourly.unknownCount} + 1` : serverEndpointPlayerHourly.unknownCount,
        playerDataCount: playerValue === null ? serverEndpointPlayerHourly.playerDataCount : sql`${serverEndpointPlayerHourly.playerDataCount} + 1`,
        playersTotal: playerValue === null ? serverEndpointPlayerHourly.playersTotal : sql`${serverEndpointPlayerHourly.playersTotal} + ${playerValue}`,
        playersPeak: playerValue === null ? serverEndpointPlayerHourly.playersPeak : sql`greatest(coalesce(${serverEndpointPlayerHourly.playersPeak}, 0), ${playerValue})`,
        capacityDataCount: capacityValue === null ? serverEndpointPlayerHourly.capacityDataCount : sql`${serverEndpointPlayerHourly.capacityDataCount} + 1`,
        capacityTotal: capacityValue === null ? serverEndpointPlayerHourly.capacityTotal : sql`${serverEndpointPlayerHourly.capacityTotal} + ${capacityValue}`,
        capacityLatest: capacityValue === null ? serverEndpointPlayerHourly.capacityLatest : capacityValue,
        occupancyDataCount: occupancyValue === null ? serverEndpointPlayerHourly.occupancyDataCount : sql`${serverEndpointPlayerHourly.occupancyDataCount} + 1`,
        occupancyBasisPointsTotal: occupancyValue === null ? serverEndpointPlayerHourly.occupancyBasisPointsTotal : sql`${serverEndpointPlayerHourly.occupancyBasisPointsTotal} + ${occupancyValue}`,
        lastSampleAt: sql`greatest(coalesce(${serverEndpointPlayerHourly.lastSampleAt}, ${observation.sampledAt}), ${observation.sampledAt})`,
      },
    });
}

export async function applyEndpointObservation(tx: DatabaseTransaction, observation: EndpointObservation): Promise<ObservationResult> {
  const [current] = await tx
    .select({
      historySourceId: serverEndpoints.historySourceId,
      healthStatus: serverEndpoints.healthStatus,
      consecutiveFailures: serverEndpoints.consecutiveFailures,
      lastCheckedAt: serverEndpoints.lastCheckedAt,
    })
    .from(serverEndpoints)
    .where(and(eq(serverEndpoints.serverId, observation.serverId), eq(serverEndpoints.edition, observation.edition)))
    .for("update")
    .limit(1);

  const [inserted] = await tx
    .insert(serverEndpointPlayerSnapshots)
    .values({
      serverId: observation.serverId,
      edition: observation.edition,
      historySourceId: observation.historySourceId,
      sampledAt: observation.sampledAt,
      status: observation.status,
      failureCode: observation.failureCode ?? null,
      playersCurrent: hasPlayerValue(observation) ? observation.playersCurrent ?? null : null,
      playersMax: hasCapacityValue(observation) ? observation.playersMax ?? null : null,
      runId: observation.runId,
    })
    .onConflictDoNothing()
    .returning({ sampledAt: serverEndpointPlayerSnapshots.sampledAt });

  if (!inserted) {
    return { persisted: false, duplicate: true, currentUpdated: false, sourceChanged: false, transition: null };
  }

  await upsertHourlyPlayerRollup(tx, observation);

  const sourceChanged = Boolean(current && current.historySourceId !== observation.historySourceId);
  const currentIsFresh = Boolean(current && (!current.lastCheckedAt || current.lastCheckedAt <= observation.observedAt));
  let currentUpdated = false;
  let transition: ObservationResult["transition"] = null;

  if (current && !sourceChanged && currentIsFresh && observation.status !== "unknown") {
    const now = observation.observedAt;
    if (observation.status === "online") {
      currentUpdated = true;
      await tx
        .update(serverEndpoints)
        .set({
          healthStatus: "online",
          playersCurrent: hasPlayerValue(observation) ? observation.playersCurrent ?? null : null,
          playersMax: hasCapacityValue(observation) ? observation.playersMax ?? null : null,
          version: observation.version ?? null,
          latencyMs: observation.latencyMs ?? null,
          lastCheckedAt: now,
          lastOnlineAt: now,
          consecutiveFailures: 0,
        })
        .where(and(eq(serverEndpoints.serverId, observation.serverId), eq(serverEndpoints.edition, observation.edition)));
      if (current.healthStatus === "offline") transition = "recovered";
    } else {
      currentUpdated = true;
      const failures = current.consecutiveFailures + 1;
      const nextHealth = failures >= FAILURE_THRESHOLD ? "offline" : current.healthStatus;
      await tx
        .update(serverEndpoints)
        .set({
          healthStatus: nextHealth,
          playersCurrent: null,
          playersMax: null,
          version: null,
          latencyMs: null,
          lastCheckedAt: now,
          consecutiveFailures: failures,
        })
        .where(and(eq(serverEndpoints.serverId, observation.serverId), eq(serverEndpoints.edition, observation.edition)));
      if (failures >= FAILURE_THRESHOLD && current.healthStatus !== "offline") transition = "down";
    }
  }

  if (transition) await enqueueEndpointNotification(tx, observation.serverId, observation.edition, transition);
  return { persisted: true, duplicate: false, currentUpdated, sourceChanged, transition };
}

async function enqueueEndpointNotification(tx: DatabaseTransaction, serverId: string, edition: MonitorEdition, transition: "down" | "recovered") {
  const [owner] = await tx
    .select({ userId: serverMembers.userId, email: user.email })
    .from(serverMembers)
    .innerJoin(user, eq(serverMembers.userId, user.id))
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.role, "owner")))
    .limit(1);
  if (!owner?.email) return;
  await tx.insert(notificationJobs).values({
    dedupeKey: `endpoint:${serverId}:${edition}:${transition}:${new Date().toISOString().slice(0, 10)}`,
    recipientUserId: owner.userId,
    recipientEmail: owner.email,
    template: `endpoint_${transition}`,
    payload: { serverId, edition, transition },
  }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
}

export async function prunePlayerHistory(tx: DatabaseTransaction, now = new Date()) {
  const rawCutoff = new Date(now.getTime() - RAW_RETENTION_MS);
  const hourlyCutoff = new Date(now.getTime() - HOURLY_RETENTION_MS);
  await tx.execute(sql`
    with doomed as (
      select ctid
      from server_endpoint_player_snapshots
      where sampled_at < ${rawCutoff}
        and exists (
          select 1
          from server_endpoint_player_hourly h
          where h.server_id = server_endpoint_player_snapshots.server_id
            and h.edition = server_endpoint_player_snapshots.edition
            and h.bucket_start = date_trunc('hour', server_endpoint_player_snapshots.sampled_at)
        )
      limit ${PRUNE_BATCH_SIZE}
    )
    delete from server_endpoint_player_snapshots s
    using doomed
    where s.ctid = doomed.ctid
  `);
  await tx.execute(sql`
    with doomed as (
      select ctid
      from server_endpoint_player_hourly
      where bucket_start < ${hourlyCutoff}
      limit ${PRUNE_BATCH_SIZE}
    )
    delete from server_endpoint_player_hourly h
    using doomed
    where h.ctid = doomed.ctid
  `);
  await tx.delete(monitorRuns).where(lt(monitorRuns.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));
}
