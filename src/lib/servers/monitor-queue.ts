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
import { getMonitorCadenceMinutes, LOW_PRIORITY_MONITOR_CADENCE_MINUTES, PUBLIC_MONITOR_CADENCE_MINUTES } from "./monitor-scheduling";
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

export function getMonitorCadenceSql() {
  return sql`case when ${servers.publicationStatus} = 'published'
    and ${servers.moderationStatus} = 'active'
    and ${servers.availabilityHiddenAt} is null then ${PUBLIC_MONITOR_CADENCE_MINUTES}::smallint else ${LOW_PRIORITY_MONITOR_CADENCE_MINUTES}::smallint end`;
}

export async function enqueueDueMonitorJobs(now = new Date(), limit = 100): Promise<MonitorDispatchResult> {
  return db.transaction(async (tx) => {
    const cadenceSql = getMonitorCadenceSql();
    const candidates = await tx.select({
      id: servers.id,
      publicationStatus: servers.publicationStatus,
      moderationStatus: servers.moderationStatus,
      availabilityHiddenAt: servers.availabilityHiddenAt,
      scheduleServerId: serverMonitorSchedules.serverId,
    }).from(servers)
      .leftJoin(serverMonitorSchedules, eq(serverMonitorSchedules.serverId, servers.id))
      .where(and(
        verifiedEndpointExists(),
        or(
          isNull(serverMonitorSchedules.serverId),
          lte(serverMonitorSchedules.nextDueAt, now),
          sql`${serverMonitorSchedules.cadenceMinutes} <> ${cadenceSql}`,
        ),
      ))
      .orderBy(
        asc(sql`${serverMonitorSchedules.nextDueAt} is not null`),
        asc(serverMonitorSchedules.nextDueAt),
        asc(servers.id),
      )
      .limit(limit)
      .for("update", { of: servers, skipLocked: true });

    if (candidates.length === 0) return { enqueued: 0, due: 0, oldestDueAt: null };

    const missingSchedules = candidates.filter((candidate) => !candidate.scheduleServerId);
    const createdSchedules = missingSchedules.length
      ? await tx.insert(serverMonitorSchedules).values(missingSchedules.map((candidate) => ({
        serverId: candidate.id,
        cadenceMinutes: getMonitorCadenceMinutes({
          publicationStatus: candidate.publicationStatus,
          moderationStatus: candidate.moderationStatus,
          availabilityHiddenAt: candidate.availabilityHiddenAt,
          hasVerifiedEndpoint: true,
        }) ?? LOW_PRIORITY_MONITOR_CADENCE_MINUTES,
        nextDueAt: now,
      }))).onConflictDoNothing().returning({ serverId: serverMonitorSchedules.serverId })
      : [];

    if (createdSchedules.length) {
      const createdCadenceByServer = new Map(missingSchedules.map((candidate) => [candidate.id, getMonitorCadenceMinutes({
        publicationStatus: candidate.publicationStatus,
        moderationStatus: candidate.moderationStatus,
        availabilityHiddenAt: candidate.availabilityHiddenAt,
        hasVerifiedEndpoint: true,
      }) ?? LOW_PRIORITY_MONITOR_CADENCE_MINUTES]));
      await tx.insert(serverMonitorScheduleHistory).values(createdSchedules.map((schedule) => ({
        serverId: schedule.serverId,
        cadenceMinutes: createdCadenceByServer.get(schedule.serverId) ?? LOW_PRIORITY_MONITOR_CADENCE_MINUTES,
        effectiveFrom: now,
      })));
    }

    const schedules = await tx.select({
      serverId: serverMonitorSchedules.serverId,
      cadenceMinutes: serverMonitorSchedules.cadenceMinutes,
      nextDueAt: serverMonitorSchedules.nextDueAt,
    }).from(serverMonitorSchedules).where(inArray(
      serverMonitorSchedules.serverId,
      candidates.map((candidate) => candidate.id),
    ));
    const scheduleByServer = new Map(schedules.map((schedule) => [schedule.serverId, schedule]));
    const dueServers = candidates.flatMap((candidate) => {
      const schedule = scheduleByServer.get(candidate.id);
      const cadenceMinutes = getMonitorCadenceMinutes({
        publicationStatus: candidate.publicationStatus,
        moderationStatus: candidate.moderationStatus,
        availabilityHiddenAt: candidate.availabilityHiddenAt,
        hasVerifiedEndpoint: true,
      });
      if (!schedule || !cadenceMinutes) return [];
      if (schedule.cadenceMinutes === cadenceMinutes && schedule.nextDueAt > now) return [];
      const scheduledAt = getMonitorScheduleSlot(cadenceMinutes, now);
      return [{
        serverId: candidate.id,
        cadenceMinutes,
        scheduledAt,
        nextDueAt: new Date(scheduledAt.getTime() + cadenceMinutes * 60_000),
        oldestDueAt: schedule.cadenceMinutes === cadenceMinutes && schedule.nextDueAt <= now ? schedule.nextDueAt : now,
      }];
    });

    if (dueServers.length === 0) return { enqueued: 0, due: 0, oldestDueAt: null };

    const cadenceChanges = dueServers.filter((entry) => scheduleByServer.get(entry.serverId)?.cadenceMinutes !== entry.cadenceMinutes);
    if (cadenceChanges.length) {
      await tx.update(serverMonitorScheduleHistory).set({ effectiveTo: now }).where(and(
        inArray(serverMonitorScheduleHistory.serverId, cadenceChanges.map((entry) => entry.serverId)),
        isNull(serverMonitorScheduleHistory.effectiveTo),
      ));
      await tx.insert(serverMonitorScheduleHistory).values(cadenceChanges.map((entry) => ({
        serverId: entry.serverId,
        cadenceMinutes: entry.cadenceMinutes,
        effectiveFrom: now,
      })));
    }

    const jobs = await tx.insert(serverMonitorJobs).values(dueServers.map((entry) => ({
      serverId: entry.serverId,
      scheduledAt: entry.scheduledAt,
      nextAttemptAt: now,
    }))).onConflictDoNothing({
      target: [serverMonitorJobs.serverId, serverMonitorJobs.scheduledAt],
    }).returning({ id: serverMonitorJobs.id });

    const serverIds = dueServers.map((entry) => entry.serverId);
    const cadenceCase = sql`case ${sql.join(dueServers.map((entry) => sql`when ${serverMonitorSchedules.serverId} = ${entry.serverId} then ${entry.cadenceMinutes}`), sql` `)} else ${serverMonitorSchedules.cadenceMinutes} end`;
    const scheduledCase = sql`case ${sql.join(dueServers.map((entry) => sql`when ${serverMonitorSchedules.serverId} = ${entry.serverId} then ${entry.scheduledAt}`), sql` `)} else ${serverMonitorSchedules.lastScheduledAt} end`;
    const nextDueCase = sql`case ${sql.join(dueServers.map((entry) => sql`when ${serverMonitorSchedules.serverId} = ${entry.serverId} then ${entry.nextDueAt}`), sql` `)} else ${serverMonitorSchedules.nextDueAt} end`;
    await tx.update(serverMonitorSchedules).set({
      cadenceMinutes: cadenceCase,
      lastScheduledAt: scheduledCase,
      nextDueAt: nextDueCase,
    }).where(inArray(serverMonitorSchedules.serverId, serverIds));

    const oldestDueAt = dueServers.reduce<Date | null>((oldest, entry) => {
      if (!oldest || entry.oldestDueAt < oldest) return entry.oldestDueAt;
      return oldest;
    }, null);
    return { enqueued: jobs.length, due: dueServers.length, oldestDueAt: oldestDueAt?.toISOString() ?? null };
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
      claimedJobs.push(job);
    }
    if (claimedJobs.length) {
      await tx.update(serverMonitorJobs).set({
        status: "processing",
        attempts: sql`${serverMonitorJobs.attempts} + 1`,
        leaseOwner: workerId,
        leaseUntil,
        processingStartedAt: now,
        lastError: null,
      }).where(inArray(serverMonitorJobs.id, claimedJobs.map((job) => job.id)));
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
