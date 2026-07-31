import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { moderationEvents, serverReports, servers } from "@/schema";
import { user } from "@/auth-schema";

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportValidationError";
  }
}

export class ReportAlreadyOpenError extends Error {
  constructor() {
    super("You already have an open report for this server.");
    this.name = "ReportAlreadyOpenError";
  }
}

export async function createServerReport(userId: string, serverId: string, reason: string, details?: string) {
  const validReasons = ["inappropriate", "misleading", "offline", "copyright", "other"] as const;
  if (!validReasons.includes(reason as (typeof validReasons)[number])) throw new ReportValidationError("Choose a valid report reason.");
  const [account] = await db.select({ emailVerified: user.emailVerified }).from(user).where(eq(user.id, userId)).limit(1);
  if (!account?.emailVerified) throw new ReportValidationError("Verify your email before reporting a server.");
  const [server] = await db.select({ id: servers.id }).from(servers).where(and(eq(servers.id, serverId), eq(servers.publicationStatus, "published"))).limit(1);
  if (!server) throw new ReportValidationError("This server is not available for reports.");
  const cleanedDetails = details?.trim().slice(0, 2_000) || null;
  try {
    const [report] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(serverReports).values({ serverId, reporterUserId: userId, reason: reason as (typeof validReasons)[number], details: cleanedDetails }).returning({ id: serverReports.id });
      if (!created) return [created];
      await tx.insert(moderationEvents).values({ serverId, reportId: created.id, actorUserId: userId, action: "report_created", details: reason });
      return [created];
    });
    return report;
  } catch (error) {
    const candidate = error as { code?: string; constraint?: string };
    if (candidate.code === "23505" && candidate.constraint?.includes("one_open_per_user_server")) throw new ReportAlreadyOpenError();
    throw error;
  }
}
