import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import { serverMonthlyVotes, servers } from "@/schema";
import { reviewScoreSql } from "@/lib/servers/review-score";

/** This month's votes for the row's server, zero when it has none yet. */
export function monthlyVotesSql(month: string): SQL<number> {
  return sql<number>`coalesce((select ${serverMonthlyVotes.votes} from ${serverMonthlyVotes} where ${serverMonthlyVotes.serverId} = ${servers.id} and ${serverMonthlyVotes.month} = ${month}), 0)`;
}

function publishedReviewCountSql() {
  return sql`(select count(*) from server_reviews sr where sr.server_id = ${servers.id} and sr.status = 'published' and sr.withheld_at is null)`;
}

/**
 * The ranking's order, shared by the catalog and by every place that states a position so the two
 * can never disagree. Ties — every server on the 1st — fall to the rating and then to how many
 * people gave it, so the start of a month reads like "Mejor valorados" rather than at random.
 */
export function rankingOrderSql(month: string): SQL[] {
  return [
    sql`${monthlyVotesSql(month)} desc`,
    sql`coalesce(${reviewScoreSql()}, 0) desc`,
    sql`${publishedReviewCountSql()} desc`,
    sql`${servers.createdAt} desc`,
    sql`${servers.id} desc`,
  ];
}

/** The servers that can be voted for and ranked: the same set the public catalog lists. */
export function rankedServerConditions() {
  return and(
    eq(servers.publicationStatus, "published"),
    eq(servers.moderationStatus, "active"),
    eq(servers.verificationStatus, "verified"),
    isNull(servers.availabilityHiddenAt),
    sql`exists (select 1 from server_endpoints se where se.server_id = ${servers.id} and se.verification_status = 'verified')`,
  );
}
