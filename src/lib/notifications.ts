import { and, eq, lt, lte } from "drizzle-orm";

import { db } from "@/db";
import { notificationJobs } from "@/schema";
import { sendNotificationEmail } from "@/lib/email";

export async function runNotificationOutbox(limit = 25) {
  const jobs = await db.transaction(async (tx) => {
    await tx.update(notificationJobs).set({ status: "pending" }).where(and(eq(notificationJobs.status, "processing"), lt(notificationJobs.createdAt, new Date(Date.now() - 15 * 60 * 1000))));
    const rows = await tx.select().from(notificationJobs).where(and(eq(notificationJobs.status, "pending"), lte(notificationJobs.nextAttemptAt, new Date()))).orderBy(notificationJobs.createdAt).limit(limit).for("update", { skipLocked: true });
    for (const row of rows) await tx.update(notificationJobs).set({ status: "processing" }).where(eq(notificationJobs.id, row.id));
    return rows;
  });
  for (const job of jobs) {
    try {
      const payload = job.payload as Record<string, unknown>;
      const subject = job.template === "report_decision" ? "Actualización de tu reporte en OpinaCraft" : job.template === "blob_quota" ? "Aviso de cuota Blob de OpinaCraft" : "Actualización de tu servidor en OpinaCraft";
      const decision = typeof payload.decision === "string" ? payload.decision : "actualizada";
      const text = job.template === "blob_quota" ? `La cuota interna de Blob ha alcanzado el ${String(payload.level ?? "")}% de uso.` : `La decisión de moderación es: ${decision}.`;
      await sendNotificationEmail({ to: job.recipientEmail, subject, text, html: `<p>${text}</p>` });
      await db.update(notificationJobs).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(notificationJobs.id, job.id));
    } catch (error) {
      const attempts = job.attempts + 1;
      await db.update(notificationJobs).set({ status: attempts >= 5 ? "failed" : "pending", attempts, nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 2 ** attempts * 60_000)), lastError: error instanceof Error ? error.message.slice(0, 500) : "Error de envío" }).where(eq(notificationJobs.id, job.id));
    }
  }
  return { processed: jobs.length };
}
