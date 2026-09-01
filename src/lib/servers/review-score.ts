import { sql, type SQL } from "drizzle-orm";

import { servers } from "@/schema";

/**
 * Ranking by the plain average is unfair to the servers that carry a real history: one 5★ review
 * would beat hundreds of them because a couple of bad ones drag the mean down. So the catalog orders
 * by a Bayesian average instead — every server starts with REVIEW_SCORE_PRIOR_COUNT imaginary
 * reviews worth REVIEW_SCORE_PRIOR_AVERAGE, and only real reviews pull the score away from that
 * prior. The average shown to the visitor is still the plain one; this only decides the order.
 */
export const REVIEW_SCORE_PRIOR_COUNT = 10;
export const REVIEW_SCORE_PRIOR_AVERAGE = 3.5;

const REVIEW_SCORE_PRIOR_MASS = REVIEW_SCORE_PRIOR_COUNT * REVIEW_SCORE_PRIOR_AVERAGE;

/**
 * null for a server nobody has reviewed, so it keeps sorting after every reviewed one instead of
 * landing mid-catalog on the strength of a prior it never earned.
 */
export function bayesianReviewScore(average: number | null, count: number): number | null {
  if (average === null || count <= 0) return null;
  return (average * count + REVIEW_SCORE_PRIOR_MASS) / (count + REVIEW_SCORE_PRIOR_COUNT);
}

/** The same formula as a correlated subquery, so Postgres can order a catalog page by it. */
export function reviewScoreSql(): SQL {
  return sql`(
    select (sum(sr.rating)::numeric + ${sql.raw(String(REVIEW_SCORE_PRIOR_MASS))}) / (count(*) + ${sql.raw(String(REVIEW_SCORE_PRIOR_COUNT))})
    from server_reviews sr
    where sr.server_id = ${servers.id}
      and sr.status = 'published'
  )`;
}
