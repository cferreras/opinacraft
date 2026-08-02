import { and, eq, isNull, lt, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { notificationJobs } from "@/schema";
import { sendChangeEmailConfirmationEmail, sendNotificationEmail } from "@/lib/email";

export async function runNotificationOutbox(limit = 25) {
  const jobs = await db.transaction(async (tx) => {
    const staleAt = new Date(Date.now() - 15 * 60 * 1000);
    await tx
      .update(notificationJobs)
      .set({ status: "pending", processingStartedAt: null })
      .where(
        and(
          eq(notificationJobs.status, "processing"),
          or(isNull(notificationJobs.processingStartedAt), lt(notificationJobs.processingStartedAt, staleAt)),
        ),
      );
    const rows = await tx
      .select()
      .from(notificationJobs)
      .where(and(eq(notificationJobs.status, "pending"), lte(notificationJobs.nextAttemptAt, new Date())))
      .orderBy(notificationJobs.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      await tx
        .update(notificationJobs)
        .set({ status: "processing", processingStartedAt: new Date() })
        .where(eq(notificationJobs.id, row.id));
    }
    return rows;
  });

  for (const job of jobs) {
    try {
      const payload = job.payload as Record<string, unknown>;
      if (job.template === "change_email_confirmation") {
        const currentEmail = typeof payload.currentEmail === "string" ? payload.currentEmail : null;
        const newEmail = typeof payload.newEmail === "string" ? payload.newEmail : null;
        const url = typeof payload.url === "string" ? payload.url : null;
        if (!currentEmail || !newEmail || !url) throw new Error("Datos incompletos para confirmar el cambio de email.");
        await sendChangeEmailConfirmationEmail({ to: job.recipientEmail, currentEmail, newEmail, url });
      } else {
        const decision = typeof payload.decision === "string" ? payload.decision : "actualizada";
        const edition = payload.edition === "bedrock" ? "Bedrock" : "Java";
        const templates: Record<string, { subject: string; text: string }> = {
          report_decision: {
            subject: "Actualización de tu reporte en OpinaCraft",
            text: `La decisión de moderación es: ${decision}.`,
          },
          review_report_decision: {
            subject: "Actualización de tu reporte de opinión en OpinaCraft",
            text: `La decisión sobre tu reporte de opinión es: ${decision}.`,
          },
          review_moderation: {
            subject: "Actualización de tu opinión en OpinaCraft",
            text: decision === "hidden"
              ? "Tu opinión ha sido ocultada temporalmente por moderación."
              : "Tu opinión ha sido restaurada y vuelve a estar visible.",
          },
          review_reply: {
            subject: "Has recibido una respuesta oficial en OpinaCraft",
            text: "El equipo del servidor ha respondido a tu opinión.",
          },
          blob_quota: {
            subject: "Aviso de cuota Blob de OpinaCraft",
            text: `La cuota interna de Blob ha alcanzado el ${String(payload.level ?? "")}% de uso.`,
          },
          endpoint_down: {
            subject: "Tu servidor no responde en OpinaCraft",
            text: `Tu endpoint ${edition} no responde. Revisa el estado del servidor.`,
          },
          endpoint_recovered: {
            subject: "Tu servidor vuelve a responder en OpinaCraft",
            text: `Tu endpoint ${edition} vuelve a responder correctamente.`,
          },
          availability_hidden: {
            subject: "Tu servidor se ha ocultado en OpinaCraft",
            text: "Tu servidor se ha ocultado del catálogo por estar sin conexión de forma prolongada.",
          },
          availability_restored: {
            subject: "Tu servidor vuelve a estar visible en OpinaCraft",
            text: "Tu servidor vuelve a estar visible en el catálogo.",
          },
        };
        const rendered = templates[job.template];
        if (!rendered) throw new Error(`Unknown notification template: ${job.template}`);
        const { subject, text } = rendered;
        await sendNotificationEmail({ to: job.recipientEmail, subject, text, html: `<p>${text}</p>` });
      }
      await db
        .update(notificationJobs)
        .set({ status: "sent", sentAt: new Date(), processingStartedAt: null, lastError: null })
        .where(eq(notificationJobs.id, job.id));
    } catch (error) {
      const attempts = job.attempts + 1;
      await db
        .update(notificationJobs)
        .set({
          status: attempts >= 5 ? "failed" : "pending",
          processingStartedAt: null,
          attempts,
          nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 2 ** attempts * 60_000)),
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Error de envío",
        })
        .where(eq(notificationJobs.id, job.id));
    }
  }
  return { processed: jobs.length };
}
