import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { moderationEvents, notificationJobs, platformRoles, serverMembers, serverReports, serverReviewReports, serverReviews, servers } from "@/schema";
import { user } from "@/auth-schema";

export async function requirePlatformRole(userId: string, minimum: "moderator" | "admin" = "moderator") {
  const role = await getPlatformRole(userId);
  if (!role || (minimum === "admin" && role !== "admin")) throw new Error("Permisos de moderación insuficientes.");
  return role;
}

export async function grantPlatformRole(actorUserId: string, email: string, role: "admin" | "moderator") {
  await requirePlatformRole(actorUserId, "admin");
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  if (!target) throw new Error("La cuenta no existe.");
  await db.insert(platformRoles).values({ userId: target.id, role, grantedByUserId: actorUserId }).onConflictDoUpdate({ target: platformRoles.userId, set: { role, grantedByUserId: actorUserId } });
}

export async function getPlatformRole(userId: string) {
  const [role] = await db.select({ role: platformRoles.role }).from(platformRoles).where(eq(platformRoles.userId, userId)).limit(1);
  return role?.role ?? null;
}

export async function listOpenReports(status: "open" | "actioned" = "open") {
  return db.select({ id: serverReports.id, serverId: serverReports.serverId, serverName: servers.name, serverSlug: servers.slug, reason: serverReports.reason, details: serverReports.details, status: serverReports.status, createdAt: serverReports.createdAt }).from(serverReports).innerJoin(servers, eq(serverReports.serverId, servers.id)).where(eq(serverReports.status, status)).orderBy(desc(serverReports.createdAt));
}

export async function moderateReport(userId: string, reportId: string, decision: "dismissed" | "hidden" | "restored") {
  await requirePlatformRole(userId);
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({ id: serverReports.id, serverId: serverReports.serverId, reporterUserId: serverReports.reporterUserId })
      .from(serverReports)
      .where(and(eq(serverReports.id, reportId), inArray(serverReports.status, decision === "restored" ? ["open", "actioned"] : ["open"])))
      .for("update")
      .limit(1);
    if (!report) return false;
    const [reporter] = report.reporterUserId
      ? await tx.select({ email: user.email }).from(user).where(eq(user.id, report.reporterUserId)).limit(1)
      : [];
    const reporterEmail = reporter?.email ?? null;
    const status = decision === "dismissed" ? "dismissed" : "actioned";
    await tx.update(serverReports).set({ status, assignedToUserId: userId }).where(eq(serverReports.id, reportId));
    await tx.insert(moderationEvents).values({ serverId: report.serverId, reportId, actorUserId: userId, action: decision, details: null });
    if (decision === "hidden") await tx.update(servers).set({ moderationStatus: "blocked" }).where(eq(servers.id, report.serverId));
    if (decision === "restored") await tx.update(servers).set({ moderationStatus: "active" }).where(eq(servers.id, report.serverId));
    if (reporterEmail) await tx.insert(notificationJobs).values({ dedupeKey: `report:${reportId}:${decision}`, recipientUserId: report.reporterUserId, recipientEmail: reporterEmail, template: "report_decision", payload: { decision, serverId: report.serverId } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    const [owner] = await tx.select({ userId: serverMembers.userId, email: user.email }).from(serverMembers).innerJoin(user, eq(serverMembers.userId, user.id)).where(and(eq(serverMembers.serverId, report.serverId), eq(serverMembers.role, "owner"))).limit(1);
    if (owner?.email && owner.userId !== report.reporterUserId) await tx.insert(notificationJobs).values({ dedupeKey: `report-owner:${reportId}:${decision}`, recipientUserId: owner.userId, recipientEmail: owner.email, template: "report_decision", payload: { decision, serverId: report.serverId } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    return true;
  });
}

export async function listOpenReviewReports(status: "open" | "actioned" = "open") {
  return db
    .select({
      id: serverReviewReports.id,
      serverId: serverReviewReports.serverId,
      serverName: servers.name,
      serverSlug: servers.slug,
      reviewId: serverReviewReports.reviewId,
      reviewRating: serverReviews.rating,
      reviewContent: serverReviews.content,
      reviewStatus: serverReviews.status,
      reporterName: user.name,
      reporterEmail: user.email,
      reason: serverReviewReports.reason,
      details: serverReviewReports.details,
      status: serverReviewReports.status,
      createdAt: serverReviewReports.createdAt,
    })
    .from(serverReviewReports)
    .innerJoin(servers, eq(serverReviewReports.serverId, servers.id))
    .leftJoin(serverReviews, eq(serverReviewReports.reviewId, serverReviews.id))
    .leftJoin(user, eq(serverReviewReports.reporterUserId, user.id))
    .where(eq(serverReviewReports.status, status))
    .orderBy(desc(serverReviewReports.createdAt));
}

export async function moderateReviewReport(userId: string, reportId: string, decision: "dismissed" | "hidden" | "restored") {
  await requirePlatformRole(userId);
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({
        id: serverReviewReports.id,
        serverId: serverReviewReports.serverId,
        reviewId: serverReviewReports.reviewId,
        reporterUserId: serverReviewReports.reporterUserId,
        status: serverReviewReports.status,
      })
      .from(serverReviewReports)
      .where(and(eq(serverReviewReports.id, reportId), inArray(serverReviewReports.status, decision === "restored" ? ["open", "actioned"] : ["open"])))
      .for("update")
      .limit(1);
    if (!report) return false;
    const [reporter] = report.reporterUserId
      ? await tx.select({ email: user.email }).from(user).where(eq(user.id, report.reporterUserId)).limit(1)
      : [];

    const [review] = report.reviewId
      ? await tx
          .select({ id: serverReviews.id, status: serverReviews.status, authorId: serverReviews.userId, authorEmail: user.email })
          .from(serverReviews)
          .leftJoin(user, eq(serverReviews.userId, user.id))
          .where(eq(serverReviews.id, report.reviewId))
          .limit(1)
      : [];

    const nextReportStatus = decision === "dismissed" ? "dismissed" : "actioned";
    await tx.update(serverReviewReports).set({ status: nextReportStatus, assignedToUserId: userId, updatedAt: new Date() }).where(eq(serverReviewReports.id, reportId));

    let reviewChanged = false;
    if (review && decision === "hidden" && review.status === "published") {
      const [changed] = await tx
        .update(serverReviews)
        .set({ status: "hidden", updatedAt: new Date() })
        .where(and(eq(serverReviews.id, review.id), eq(serverReviews.status, "published")))
        .returning({ id: serverReviews.id });
      reviewChanged = Boolean(changed);
    }
    if (review && decision === "restored" && review.status === "hidden") {
      const reviewEvents = await tx
        .select({
          id: moderationEvents.id,
          reviewReportId: moderationEvents.reviewReportId,
          action: moderationEvents.action,
          createdAt: moderationEvents.createdAt,
        })
        .from(moderationEvents)
        .where(eq(moderationEvents.reviewId, review.id))
        .orderBy(desc(moderationEvents.createdAt), desc(moderationEvents.id));
      const latestActionByReport = new Map<string, string>();
      for (const event of reviewEvents) {
        if (event.reviewReportId && !latestActionByReport.has(event.reviewReportId)) {
          latestActionByReport.set(event.reviewReportId, event.action);
        }
      }
      const anotherReportStillHides = [...latestActionByReport.entries()]
        .some(([reviewReportId, action]) => reviewReportId !== report.id && action === "hidden");
      if (!anotherReportStillHides) {
        const [changed] = await tx
          .update(serverReviews)
          .set({ status: "published", updatedAt: new Date() })
          .where(and(eq(serverReviews.id, review.id), eq(serverReviews.status, "hidden")))
          .returning({ id: serverReviews.id });
        reviewChanged = Boolean(changed);
      }
    }

    await tx.insert(moderationEvents).values({
      serverId: report.serverId,
      reviewId: report.reviewId,
      reviewReportId: report.id,
      actorUserId: userId,
      action: decision,
      details: null,
    });

    if (reporter?.email) {
      await tx.insert(notificationJobs).values({
        dedupeKey: `review-report:${report.id}:${decision}`,
        recipientUserId: report.reporterUserId,
        recipientEmail: reporter.email,
        template: "review_report_decision",
        payload: { decision, serverId: report.serverId, reviewId: report.reviewId },
      }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    }
    if (review?.authorEmail && reviewChanged && (decision === "hidden" || decision === "restored")) {
      await tx.insert(notificationJobs).values({
        dedupeKey: `review-moderation:${report.id}:${decision}`,
        recipientUserId: review.authorId,
        recipientEmail: review.authorEmail,
        template: "review_moderation",
        payload: { decision, serverId: report.serverId, reviewId: report.reviewId },
      }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    }
    return true;
  });
}
