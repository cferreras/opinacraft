import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaAccountUsage, mediaUsageCounters, notificationJobs } from "@/schema";
import { serverEnv } from "@/env/server";

const DEFAULT_STORAGE_LIMIT = 1_000_000_000;
const DEFAULT_ADVANCED_LIMIT = 2_000;
const TOTAL_STORAGE_KEY = "total";

export class MediaQuotaExceededError extends Error {
  constructor() {
    super("La cuota mensual de almacenamiento multimedia está temporalmente bloqueada.");
    this.name = "MediaQuotaExceededError";
  }
}

export class MediaAccountQuotaExceededError extends Error {
  constructor() {
    super("Has alcanzado tu límite de subidas de imágenes. Inténtalo de nuevo más tarde.");
    this.name = "MediaAccountQuotaExceededError";
  }
}

// A single account may consume at most this fraction of the shared monthly
// operation budget, and only this many uploads inside a short burst window.
const ACCOUNT_PERIOD_SHARE = 0.05;
const ACCOUNT_MIN_PERIOD_OPERATIONS = 20;
const ACCOUNT_WINDOW_MS = 10 * 60_000;
const ACCOUNT_WINDOW_OPERATIONS = 10;

function period() {
  return new Date().toISOString().slice(0, 7);
}

function limits() {
  return {
    storage: Number(process.env.BLOB_STORAGE_LIMIT_BYTES) || DEFAULT_STORAGE_LIMIT,
    advanced: Number(process.env.BLOB_ADVANCED_OPERATION_LIMIT) || DEFAULT_ADVANCED_LIMIT,
  };
}

function accountLimits() {
  const { advanced } = limits();
  return {
    period: Math.max(ACCOUNT_MIN_PERIOD_OPERATIONS, Math.floor(advanced * ACCOUNT_PERIOD_SHARE)),
    window: ACCOUNT_WINDOW_OPERATIONS,
  };
}

/**
 * Claims one upload against the account's own share of the shared monthly
 * budget. A single atomic upsert does the counting, so parallel requests from
 * the same account cannot race past the limit. Called before image processing
 * so an abusive caller cannot even spend CPU on decoding.
 */
export async function reserveAccountMediaOperation(userId: string, now = new Date()) {
  const key = period();
  const caps = accountLimits();
  const windowFloor = new Date(now.getTime() - ACCOUNT_WINDOW_MS);
  const [row] = await db
    .insert(mediaAccountUsage)
    .values({ userId, period: key, advancedOperations: 1, windowStartedAt: now, windowOperations: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: [mediaAccountUsage.userId, mediaAccountUsage.period],
      set: {
        advancedOperations: sql`${mediaAccountUsage.advancedOperations} + 1`,
        windowStartedAt: sql`case when ${mediaAccountUsage.windowStartedAt} < ${windowFloor} then ${now} else ${mediaAccountUsage.windowStartedAt} end`,
        windowOperations: sql`case when ${mediaAccountUsage.windowStartedAt} < ${windowFloor} then 1 else ${mediaAccountUsage.windowOperations} + 1 end`,
        updatedAt: now,
      },
    })
    .returning({ advancedOperations: mediaAccountUsage.advancedOperations, windowOperations: mediaAccountUsage.windowOperations });
  if (!row || row.advancedOperations > caps.period || row.windowOperations > caps.window) {
    throw new MediaAccountQuotaExceededError();
  }
  return { period: key, operations: row.advancedOperations, operationLimit: caps.period };
}

export async function releaseAccountMediaOperation(userId: string, now = new Date()) {
  // Only refunds work that never happened (a failed upload), never a completed
  // one: the provider operation itself is spent whether or not it is kept.
  await db
    .update(mediaAccountUsage)
    .set({
      advancedOperations: sql`greatest(0, ${mediaAccountUsage.advancedOperations} - 1)`,
      windowOperations: sql`greatest(0, ${mediaAccountUsage.windowOperations} - 1)`,
      updatedAt: now,
    })
    .where(and(eq(mediaAccountUsage.userId, userId), eq(mediaAccountUsage.period, period())));
}

export async function reserveMediaQuota(bytes: number) {
  const key = period();
  const { storage, advanced } = limits();
  return db.transaction(async (tx) => {
    await tx.insert(mediaUsageCounters).values([{ period: key }, { period: TOTAL_STORAGE_KEY }]).onConflictDoNothing();
    const counters = await tx
      .select()
      .from(mediaUsageCounters)
      .where(inArray(mediaUsageCounters.period, [key, TOTAL_STORAGE_KEY]))
      .for("update");
    const periodCounter = counters.find((counter) => counter.period === key);
    const totalCounter = counters.find((counter) => counter.period === TOTAL_STORAGE_KEY);
    const currentBytes = Number(totalCounter?.storedBytes ?? 0);
    const currentOps = Number(periodCounter?.advancedOperations ?? 0);
    if (currentBytes >= storage * 0.95 || currentOps >= advanced * 0.95) {
      throw new MediaQuotaExceededError();
    }
    const nextBytes = currentBytes + bytes;
    const nextOps = currentOps + 1;
    const now = new Date();
    const periodUpdate: Record<string, unknown> = { advancedOperations: nextOps, updatedAt: now };
    if (periodCounter?.blockedAt) periodUpdate.blockedAt = null;
    if (!periodCounter?.alerted70 && (nextBytes >= storage * 0.7 || nextOps >= advanced * 0.7)) periodUpdate.alerted70 = now;
    if (!periodCounter?.alerted85 && (nextBytes >= storage * 0.85 || nextOps >= advanced * 0.85)) periodUpdate.alerted85 = now;
    if (!periodCounter?.alerted95 && (nextBytes >= storage * 0.95 || nextOps >= advanced * 0.95)) periodUpdate.alerted95 = now;
    if (nextBytes >= storage * 0.95 || nextOps >= advanced * 0.95) periodUpdate.blockedAt = now;
    await tx.update(mediaUsageCounters).set({ storedBytes: nextBytes, updatedAt: now }).where(eq(mediaUsageCounters.period, TOTAL_STORAGE_KEY));
    await tx.update(mediaUsageCounters).set(periodUpdate).where(eq(mediaUsageCounters.period, key));
    if (serverEnv.BLOB_OPERATOR_EMAIL) {
      const level = !periodCounter?.alerted95 && (nextBytes >= storage * 0.95 || nextOps >= advanced * 0.95)
        ? 95
        : !periodCounter?.alerted85 && (nextBytes >= storage * 0.85 || nextOps >= advanced * 0.85)
          ? 85
          : !periodCounter?.alerted70 && (nextBytes >= storage * 0.7 || nextOps >= advanced * 0.7)
            ? 70
            : null;
      if (level) await tx.insert(notificationJobs).values({ dedupeKey: `blob-quota:${key}:${level}`, recipientEmail: serverEnv.BLOB_OPERATOR_EMAIL, template: "blob_quota", payload: { period: key, level, bytes: nextBytes, operations: nextOps } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    }
    return { period: key, bytes: nextBytes, operations: nextOps, storageLimit: storage, operationLimit: advanced };
  });
}

export async function releaseMediaQuota(bytes: number) {
  const key = period();
  const { storage, advanced } = limits();
  await db.transaction(async (tx) => {
    const [totalCounter] = await tx.select().from(mediaUsageCounters).where(eq(mediaUsageCounters.period, TOTAL_STORAGE_KEY)).for("update");
    const [periodCounter] = await tx.select().from(mediaUsageCounters).where(eq(mediaUsageCounters.period, key)).for("update");
    if (!totalCounter) return;
    const nextBytes = Math.max(0, Number(totalCounter.storedBytes) - bytes);
    await tx.update(mediaUsageCounters).set({ storedBytes: nextBytes, updatedAt: new Date() }).where(eq(mediaUsageCounters.period, TOTAL_STORAGE_KEY));
    if (periodCounter) {
      await tx.update(mediaUsageCounters).set({ blockedAt: nextBytes < storage * 0.95 && Number(periodCounter.advancedOperations) < advanced * 0.95 ? null : periodCounter.blockedAt, updatedAt: new Date() }).where(eq(mediaUsageCounters.period, key));
    }
  });
}

export async function getMediaQuota() {
  const key = period();
  const counters = await db.select().from(mediaUsageCounters).where(inArray(mediaUsageCounters.period, [key, TOTAL_STORAGE_KEY]));
  const periodCounter = counters.find((counter) => counter.period === key);
  const totalCounter = counters.find((counter) => counter.period === TOTAL_STORAGE_KEY);
  const { storage, advanced } = limits();
  return { period: key, bytes: totalCounter?.storedBytes ?? 0, operations: periodCounter?.advancedOperations ?? 0, storageLimit: storage, operationLimit: advanced, blocked: Boolean(periodCounter?.blockedAt) };
}
