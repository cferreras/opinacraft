import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaUsageCounters, notificationJobs } from "@/schema";
import { serverEnv } from "@/env/server";

const DEFAULT_STORAGE_LIMIT = 1_000_000_000;
const DEFAULT_ADVANCED_LIMIT = 2_000;

export class MediaQuotaExceededError extends Error {
  constructor() {
    super("La cuota mensual de almacenamiento multimedia está temporalmente bloqueada.");
    this.name = "MediaQuotaExceededError";
  }
}

function period() {
  return new Date().toISOString().slice(0, 7);
}

function limits() {
  return {
    storage: Number(process.env.BLOB_STORAGE_LIMIT_BYTES) || DEFAULT_STORAGE_LIMIT,
    advanced: Number(process.env.BLOB_ADVANCED_OPERATION_LIMIT) || DEFAULT_ADVANCED_LIMIT,
  };
}

export async function reserveMediaQuota(bytes: number) {
  const key = period();
  const { storage, advanced } = limits();
  return db.transaction(async (tx) => {
    await tx.insert(mediaUsageCounters).values({ period: key }).onConflictDoNothing();
    const [counter] = await tx.select().from(mediaUsageCounters).where(eq(mediaUsageCounters.period, key)).for("update");
    const currentBytes = Number(counter?.storedBytes ?? 0);
    const currentOps = Number(counter?.advancedOperations ?? 0);
    if (counter?.blockedAt || currentBytes >= storage * 0.95 || currentOps >= advanced * 0.95) {
      await tx.update(mediaUsageCounters).set({ blockedAt: counter?.blockedAt ?? new Date(), updatedAt: new Date() }).where(eq(mediaUsageCounters.period, key));
      throw new MediaQuotaExceededError();
    }
    const nextBytes = currentBytes + bytes;
    const nextOps = currentOps + 1;
    const update: Record<string, unknown> = { storedBytes: nextBytes, advancedOperations: nextOps, updatedAt: new Date() };
    if (!counter?.alerted70 && (nextBytes >= storage * .7 || nextOps >= advanced * .7)) update.alerted70 = new Date();
    if (!counter?.alerted85 && (nextBytes >= storage * .85 || nextOps >= advanced * .85)) update.alerted85 = new Date();
    if (!counter?.alerted95 && (nextBytes >= storage * .95 || nextOps >= advanced * .95)) update.alerted95 = new Date();
    if (nextBytes >= storage * .95 || nextOps >= advanced * .95) update.blockedAt = new Date();
    await tx.update(mediaUsageCounters).set(update).where(eq(mediaUsageCounters.period, key));
    if (serverEnv.BLOB_OPERATOR_EMAIL) {
      const level = !counter?.alerted95 && (nextBytes >= storage * .95 || nextOps >= advanced * .95) ? 95 : !counter?.alerted85 && (nextBytes >= storage * .85 || nextOps >= advanced * .85) ? 85 : !counter?.alerted70 && (nextBytes >= storage * .7 || nextOps >= advanced * .7) ? 70 : null;
      if (level) await tx.insert(notificationJobs).values({ dedupeKey: `blob-quota:${key}:${level}`, recipientEmail: serverEnv.BLOB_OPERATOR_EMAIL, template: "blob_quota", payload: { period: key, level, bytes: nextBytes, operations: nextOps } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    }
    return { period: key, bytes: nextBytes, operations: nextOps, storageLimit: storage, operationLimit: advanced };
  });
}

export async function releaseMediaQuota(bytes: number) {
  const key = period();
  await db.update(mediaUsageCounters).set({ storedBytes: sql`greatest(0, ${mediaUsageCounters.storedBytes} - ${bytes})`, updatedAt: new Date() }).where(eq(mediaUsageCounters.period, key));
}

export async function getMediaQuota() {
  const key = period();
  const [counter] = await db.select().from(mediaUsageCounters).where(eq(mediaUsageCounters.period, key)).limit(1);
  const { storage, advanced } = limits();
  return { period: key, bytes: counter?.storedBytes ?? 0, operations: counter?.advancedOperations ?? 0, storageLimit: storage, operationLimit: advanced, blocked: Boolean(counter?.blockedAt) };
}
