import { and, eq, lt, lte } from "drizzle-orm";

import { db } from "@/db";
import { mediaCleanupJobs } from "@/schema";
import { mediaStorage } from "@/lib/media/storage";

export async function enqueueMediaCleanup(blobKey: string, error?: unknown) {
  await db.insert(mediaCleanupJobs).values({ blobKey, lastError: error instanceof Error ? error.message.slice(0, 500) : null }).onConflictDoUpdate({ target: mediaCleanupJobs.blobKey, set: { status: "pending", nextAttemptAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : null } });
}

export async function removeMediaOrEnqueue(blobKey: string) {
  try {
    await mediaStorage.remove(blobKey);
  } catch (error) {
    try {
      await enqueueMediaCleanup(blobKey, error);
    } catch (cleanupError) {
      console.error("Failed to enqueue media cleanup", cleanupError);
    }
  }
}

export async function runMediaCleanup(limit = 100) {
  const jobs = await db.transaction(async (tx) => {
    await tx.update(mediaCleanupJobs).set({ status: "pending" }).where(and(eq(mediaCleanupJobs.status, "processing"), lt(mediaCleanupJobs.updatedAt, new Date(Date.now() - 15 * 60 * 1000))));
    const rows = await tx.select({ id: mediaCleanupJobs.id, blobKey: mediaCleanupJobs.blobKey, attempts: mediaCleanupJobs.attempts }).from(mediaCleanupJobs).where(and(eq(mediaCleanupJobs.status, "pending"), lte(mediaCleanupJobs.nextAttemptAt, new Date()))).limit(limit).for("update", { skipLocked: true });
    for (const row of rows) await tx.update(mediaCleanupJobs).set({ status: "processing" }).where(eq(mediaCleanupJobs.id, row.id));
    return rows;
  });
  for (const job of jobs) {
    try {
      await mediaStorage.remove(job.blobKey);
      await db.update(mediaCleanupJobs).set({ status: "done", lastError: null }).where(eq(mediaCleanupJobs.id, job.id));
    } catch (error) {
      const attempts = job.attempts + 1;
      await db.update(mediaCleanupJobs).set({ status: attempts >= 5 ? "failed" : "pending", attempts, nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 2 ** attempts * 60_000)), lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown cleanup error" }).where(eq(mediaCleanupJobs.id, job.id));
    }
  }
  return { processed: jobs.length };
}
