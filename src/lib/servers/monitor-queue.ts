import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  serverEndpoints,
  serverMonitorJobs,
  serverMonitorScheduleHistory,
  serverMonitorSchedules,
  serverNetworkTargets,
  servers,
} from "@/schema";
import { getMonitorCadenceMinutes } from "./monitor-scheduling";
import { getMonitorJobRetry, getMonitorScheduleSlot } from "./monitor-jobs";

export type MonitorDispatchResult = {
  enqueued: number;
  due: number;
  oldestDueAt: string | null;
};

function verifiedEndpointExists() {
  return sql`exists (
    select 1 from server_endpoints verified_endpoint
    where verified_endpoint.server_id = ${servers.id}
      and verified_endpoint.verification_status = 'verified'
  )`;
}

export async function enqueueDueMonitorJobs(now = new Date(), limit = 100): Promise<MonitorDispatchResult> {
  return db.transaction(async (tx) => {
    const candidates = await tx.select({
      id: servers.id,
      publicationStatus: servers.publicationStatus,
      moderationStatus: servers.moderationStatus,
      availabilityHiddenAt: servers.availabilityHiddenAt,
      scheduleCadence: serverMonitorSchedules.cadenceMinutes,
      nextDueAt: serverMonitorSchedules.nextDueAt,
    }).from(servers)
      .leftJoin(serverMonitorSchedules, eq(serverMonitorSchedules.serverId, servers.id))
      .where(verifiedEndpointExists())
      .orderBy(asc(serverMonitorSchedules.nextDueAt), asc(servers.id))
      .limit(limit);

    let enqueued = 0;
    let due = 0;
    let oldestDueAt: Date | null = null;
    for (const candidate of candidates) {
      const cadenceMinutes = getMonitorCadenceMinutes({
        publicationStatus: candidate.publicationStatus,
        moderationStatus: candidate.moderationStatus,
        availabilityHiddenAt: candidate.availabilityHiddenAt,
        hasVerifiedEndpoint: true,
      });
      if (!cadenceMinutes) continue;

      const [lockedSchedule] = await tx.select({
        cadenceMinutes: serverMonitorSchedules.cadenceMinutes,
        nextDueAt: serverMonitorSchedules.nextDueAt,
      }).from(serverMonitorSchedules)
        .where(eq(serverMonitorSchedules.serverId, candidate.id))
        .for("update")
        .limit(1);

      let scheduleCadence = lockedSchedule?.cadenceMinutes ?? candidate.scheduleCadence;
      let nextDueAt = lockedSchedule?.nextDueAt ?? candidate.nextDueAt;
      if (!scheduleCadence || !nextDueAt) {
        const [createdSchedule] = await tx.insert(serverMonitorSchedules).values({
          serverId: candidate.id,
          cadenceMinutes,
          nextDueAt: now,
        }).onConflictDoNothing().returning({ serverId: serverMonitorSchedules.serverId });

        if (createdSchedule) {
          await tx.insert(serverMonitorScheduleHistory).values({
            serverId: candidate.id,
            cadenceMinutes,
            effectiveFrom: now,
          });
          scheduleCadence = cadenceMinutes;
          nextDueAt = now;
        } else {
          const [existingSchedule] = await tx.select({
            cadenceMinutes: serverMonitorSchedules.cadenceMinutes,
            nextDueAt: serverMonitorSchedules.nextDueAt,
          }).from(serverMonitorSchedules)
            .where(eq(serverMonitorSchedules.serverId, candidate.id))
            .for("update")
            .limit(1);
          scheduleCadence = existingSchedule?.cadenceMinutes ?? cadenceMinutes;
          nextDueAt = existingSchedule?.nextDueAt ?? now;
        }
      }

      if (scheduleCadence !== cadenceMinutes) {
        await tx.update(serverMonitorScheduleHistory).set({ effectiveTo: now }).where(and(
          eq(serverMonitorScheduleHistory.serverId, candidate.id),
          isNull(serverMonitorScheduleHistory.effectiveTo),
        ));
        await tx.insert(serverMonitorScheduleHistory).values({
          serverId: candidate.id,
          cadenceMinutes,
          effectiveFrom: now,
        });
        await tx.update(serverMonitorSchedules).set({ cadenceMinutes, nextDueAt: now }).where(eq(serverMonitorSchedules.serverId, candidate.id));
        scheduleCadence = cadenceMinutes;
        nextDueAt = now;
      }

      if (nextDueAt > now) continue;
      due += 1;
      const scheduledAt = getMonitorScheduleSlot(now, cadenceMinutes);
      const [job] = await tx.insert(serverMonitorJobs).values({
        serverId: candidate.id,
        scheduledAt,
        nextAttemptAt: now,
      }).onConflictDoNothing({ target: [serverMonitorJobs.serverId, serverMonitorJobs.scheduledAt] }).returning({ id: serverMonitorJobs.id });
      if (job) enqueued += 1;
      if (!oldestDueAt || nextDueAt < oldestDueAt) oldestDueAt = nextDueAt;
      await tx.update(serverMonitorSchedules).set({
        lastScheduledAt: scheduledAt,
        nextDueAt: new Date(scheduledAt.getTime() + cadenceMinutes * 60_000),
      }).where(eq(serverMonitorSchedules.serverId, candidate.id));
    }

    return { enqueued, due, oldestDueAt: oldestDueAt?.toISOString() ?? null };
  });
}

export type ClaimedMonitorJob = {
  id: string;
  serverId: string;
  scheduledAt: Date;
  attempts: number;
  endpoints: Array<{
    edition: "java" | "bedrock";
    verificationStatus: "unverified" | "verified";
    host: string;
    port: number;
  }>;
};

export async function claimMonitorJobs(workerId: string, limit: number, now = new Date(), leaseMs = 5 * 60_000): Promise<ClaimedMonitorJob[]> {
  return db.transaction(async (tx) => {
    const jobRows = await tx.select({
      id: serverMonitorJobs.id,
      serverId: serverMonitorJobs.serverId,
      scheduledAt: serverMonitorJobs.scheduledAt,
      attempts: serverMonitorJobs.attempts,
    }).from(serverMonitorJobs)
      .where(and(
        or(
          and(eq(serverMonitorJobs.status, "pending"), lte(serverMonitorJobs.nextAttemptAt, now)),
          and(eq(serverMonitorJobs.status, "processing"), lte(serverMonitorJobs.leaseUntil, now)),
        ),
        sql`exists (
          select 1 from server_endpoints verified_endpoint
          where verified_endpoint.server_id = ${serverMonitorJobs.serverId}
            and verified_endpoint.verification_status = 'verified'
        )`,
      ))
      .orderBy(asc(serverMonitorJobs.scheduledAt), asc(serverMonitorJobs.id))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (jobRows.length === 0) return [];
    const endpointRows = await tx.select({
      jobId: serverMonitorJobs.id,
      edition: serverEndpoints.edition,
      verificationStatus: serverEndpoints.verificationStatus,
      networkHost: serverNetworkTargets.host,
      endpointHost: serverEndpoints.host,
      port: serverEndpoints.port,
    }).from(serverMonitorJobs)
      .innerJoin(serverEndpoints, eq(serverEndpoints.serverId, serverMonitorJobs.serverId))
      .leftJoin(serverNetworkTargets, eq(serverNetworkTargets.serverId, serverMonitorJobs.serverId))
      .where(and(
        inArray(serverMonitorJobs.id, jobRows.map((job) => job.id)),
        eq(serverEndpoints.verificationStatus, "verified"),
      ));

    const endpointsByJob = new Map<string, ClaimedMonitorJob["endpoints"]>();
    for (const row of endpointRows) {
      endpointsByJob.set(row.jobId, [...(endpointsByJob.get(row.jobId) ?? []), {
        edition: row.edition,
        verificationStatus: row.verificationStatus,
        host: row.networkHost ?? row.endpointHost,
        port: row.port,
      }]);
    }

    const leaseUntil = new Date(now.getTime() + leaseMs);
    const claimedJobs: ClaimedMonitorJob[] = [];
    for (const row of jobRows) {
      const endpoints = endpointsByJob.get(row.id);
      if (!endpoints?.length) continue;
      const job: ClaimedMonitorJob = {
        id: row.id,
        serverId: row.serverId,
        scheduledAt: row.scheduledAt,
        attempts: row.attempts + 1,
        endpoints,
      };
      await tx.update(serverMonitorJobs).set({
        status: "processing",
        attempts: sql`${serverMonitorJobs.attempts} + 1`,
        leaseOwner: workerId,
        leaseUntil,
        processingStartedAt: now,
        lastError: null,
      }).where(eq(serverMonitorJobs.id, job.id));
      claimedJobs.push(job);
    }
    return claimedJobs;
  });
}

export async function failMonitorJob(jobId: string, attempt: number, error: unknown, now = new Date(), workerId?: string) {
  const retry = getMonitorJobRetry(attempt, now);
  await db.update(serverMonitorJobs).set({
    status: retry.status,
    nextAttemptAt: retry.nextAttemptAt ?? now,
    leaseOwner: null,
    leaseUntil: null,
    lastError: error instanceof Error ? error.message.slice(0, 500) : "Monitor job failed.",
    completedAt: retry.status === "failed" ? now : null,
  }).where(and(
    eq(serverMonitorJobs.id, jobId),
    eq(serverMonitorJobs.status, "processing"),
    workerId ? eq(serverMonitorJobs.leaseOwner, workerId) : undefined,
  ));
}
