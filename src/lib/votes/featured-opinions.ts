import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import { serverReviews } from "@/schema";

export type FeaturedOpinion = { excerpt: string; rating: number; authorName: string };

export const OPINION_EXCERPT_LENGTH = 160;

/**
 * A row has two lines for the quote, so a long review is cut on a word boundary and says so with an
 * ellipsis; the limit counts the ellipsis, so the excerpt never runs past it.
 */
export function opinionExcerpt(content: string, maxLength = OPINION_EXCERPT_LENGTH) {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const room = text.slice(0, maxLength - 1);
  const lastSpace = room.lastIndexOf(" ");
  // One word longer than the whole excerpt (a pasted link) has no boundary to respect.
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room;
  return `${cut.replace(/[\s,;:.·—–-]+$/u, "")}…`;
}

/**
 * The opinion each server's row quotes: its best-rated published review, from someone who voted
 * for it when there is one — a player who votes is one who plays — and the most recent among equals.
 */
export async function getFeaturedOpinions(serverIds: readonly string[]): Promise<Map<string, FeaturedOpinion>> {
  if (serverIds.length === 0) return new Map();
  const authorVoted = sql`(${serverReviews.userId} is not null and exists (select 1 from server_votes sv where sv.server_id = ${serverReviews.serverId} and sv.user_id = ${serverReviews.userId}))`;
  const rows = await db
    .selectDistinctOn([serverReviews.serverId], {
      serverId: serverReviews.serverId,
      content: serverReviews.content,
      rating: serverReviews.rating,
      authorName: user.name,
    })
    .from(serverReviews)
    .leftJoin(user, eq(serverReviews.userId, user.id))
    .where(and(inArray(serverReviews.serverId, [...serverIds]), eq(serverReviews.status, "published"), isNull(serverReviews.withheldAt)))
    .orderBy(serverReviews.serverId, desc(serverReviews.rating), desc(authorVoted), desc(serverReviews.createdAt), desc(serverReviews.id));

  return new Map(rows.flatMap((row) => {
    const excerpt = opinionExcerpt(row.content);
    // A deleted account leaves its review behind without a name, as on the ficha.
    return excerpt ? [[row.serverId, { excerpt, rating: row.rating, authorName: row.authorName ?? "Usuario anónimo" }] as const] : [];
  }));
}
