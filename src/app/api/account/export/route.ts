import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, inArray } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { moderationEvents, reviewReplies, serverEndpoints, serverMedia, serverMembers, serverReviewReports, serverReviews, serverTags, servers, tags } from "@/schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const owned = await db.select({ id: servers.id, name: servers.name, slug: servers.slug, description: servers.description, publicationStatus: servers.publicationStatus, createdAt: servers.createdAt, updatedAt: servers.updatedAt }).from(servers).innerJoin(serverMembers, eq(serverMembers.serverId, servers.id)).where(eq(serverMembers.userId, session.user.id));
  const ids = owned.map((server) => server.id);
  const endpoints = ids.length ? await db.select().from(serverEndpoints).where(inArray(serverEndpoints.serverId, ids)) : [];
  const media = ids.length ? await db.select({ serverId: serverMedia.serverId, kind: serverMedia.kind, url: serverMedia.blobUrl, bytes: serverMedia.bytes, width: serverMedia.width, height: serverMedia.height }).from(serverMedia).where(inArray(serverMedia.serverId, ids)) : [];
  const tagRows = ids.length ? await db.select({ serverId: serverTags.serverId, label: tags.label, slug: tags.slug }).from(serverTags).innerJoin(tags, eq(serverTags.tagId, tags.id)).where(inArray(serverTags.serverId, ids)) : [];
  const [reviews, replies, reviewReports, moderation] = await Promise.all([
    db.select().from(serverReviews).where(eq(serverReviews.userId, session.user.id)),
    db.select().from(reviewReplies).where(eq(reviewReplies.userId, session.user.id)),
    db.select().from(serverReviewReports).where(eq(serverReviewReports.reporterUserId, session.user.id)),
    db.select().from(moderationEvents).where(eq(moderationEvents.actorUserId, session.user.id)),
  ]);
  return NextResponse.json({ exportedAt: new Date().toISOString(), account: { id: session.user.id, email: session.user.email, name: session.user.name }, servers: owned, endpoints, media, tags: tagRows, reviews, officialReplies: replies, reviewReports, moderationEvents: moderation });
}
