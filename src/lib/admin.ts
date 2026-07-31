import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { moderationEvents, platformRoles, serverMembers, serverReports, servers, notificationJobs } from "@/schema";
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
    const [report] = await tx.select({ id: serverReports.id, serverId: serverReports.serverId, reporterUserId: serverReports.reporterUserId, reporterEmail: user.email }).from(serverReports).leftJoin(user, eq(serverReports.reporterUserId, user.id)).where(and(eq(serverReports.id, reportId), inArray(serverReports.status, decision === "restored" ? ["open", "actioned"] : ["open"]))).for("update").limit(1);
    if (!report) return false;
    const status = decision === "dismissed" ? "dismissed" : "actioned";
    await tx.update(serverReports).set({ status, assignedToUserId: userId }).where(eq(serverReports.id, reportId));
    await tx.insert(moderationEvents).values({ serverId: report.serverId, reportId, actorUserId: userId, action: decision, details: null });
    if (decision === "hidden") await tx.update(servers).set({ moderationStatus: "blocked" }).where(eq(servers.id, report.serverId));
    if (decision === "restored") await tx.update(servers).set({ moderationStatus: "active" }).where(eq(servers.id, report.serverId));
    if (report.reporterEmail) await tx.insert(notificationJobs).values({ dedupeKey: `report:${reportId}:${decision}`, recipientUserId: report.reporterUserId, recipientEmail: report.reporterEmail, template: "report_decision", payload: { decision, serverId: report.serverId } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    const [owner] = await tx.select({ userId: serverMembers.userId, email: user.email }).from(serverMembers).innerJoin(user, eq(serverMembers.userId, user.id)).where(and(eq(serverMembers.serverId, report.serverId), eq(serverMembers.role, "owner"))).limit(1);
    if (owner?.email && owner.userId !== report.reporterUserId) await tx.insert(notificationJobs).values({ dedupeKey: `report-owner:${reportId}:${decision}`, recipientUserId: owner.userId, recipientEmail: owner.email, template: "report_decision", payload: { decision, serverId: report.serverId } }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    return true;
  });
}
