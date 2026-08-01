import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { moderationEvents, reviewReplies, serverMembers, serverMedia, serverReports, serverReviewReports, serverReviews, servers } from "@/schema";
import { user } from "@/auth-schema";
import { mediaStorage } from "@/lib/media/storage";
import { enqueueMediaCleanup } from "@/lib/media/cleanup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== "DELETE ACCOUNT") return NextResponse.json({ error: "Type DELETE ACCOUNT to confirm." }, { status: 400 });
  const media = await db.transaction(async (tx) => {
    const owned = await tx.select({ id: servers.id }).from(servers).innerJoin(serverMembers, eq(serverMembers.serverId, servers.id)).where(and(eq(serverMembers.userId, session.user.id), eq(serverMembers.role, "owner")));
    const keys = owned.length ? await tx.select({ blobKey: serverMedia.blobKey }).from(serverMedia).where(inArray(serverMedia.serverId, owned.map((server) => server.id))) : [];
    for (const server of owned) await tx.delete(servers).where(eq(servers.id, server.id));
    await tx.update(serverReports).set({ reporterUserId: null, details: null }).where(eq(serverReports.reporterUserId, session.user.id));
    await tx.update(serverReviewReports).set({ reporterUserId: null, details: null }).where(eq(serverReviewReports.reporterUserId, session.user.id));
    await tx.update(serverReviewReports).set({ assignedToUserId: null }).where(eq(serverReviewReports.assignedToUserId, session.user.id));
    await tx.update(moderationEvents).set({ actorUserId: null, details: null }).where(eq(moderationEvents.actorUserId, session.user.id));
    await tx.update(serverReviews).set({ userId: null, content: "Opinión anónima", updatedAt: new Date() }).where(eq(serverReviews.userId, session.user.id));
    await tx.update(reviewReplies).set({ userId: null, content: "Respuesta oficial anónima", updatedAt: new Date() }).where(eq(reviewReplies.userId, session.user.id));
    await tx.delete(serverMembers).where(eq(serverMembers.userId, session.user.id));
    await tx.delete(user).where(eq(user.id, session.user.id));
    return keys.map((row) => row.blobKey);
  });
  await Promise.all(media.map((key) => mediaStorage.remove(key).catch((error) => enqueueMediaCleanup(key, error))));
  return NextResponse.json({ ok: true });
}
