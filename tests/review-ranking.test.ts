import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  REVIEW_SCORE_PRIOR_AVERAGE,
  REVIEW_SCORE_PRIOR_COUNT,
  bayesianReviewScore,
  reviewScoreSql,
} from "@/lib/servers/review-score";

test("a lone five-star review cannot outrank a long history of good ones", () => {
  const newcomer = bayesianReviewScore(5, 1)!;
  const veteran = bayesianReviewScore(4.6, 200)!;

  assert.ok(newcomer < veteran, `${newcomer} should rank below ${veteran}`);
  // The newcomer still beats a server whose many reviews are genuinely bad.
  assert.ok(newcomer > bayesianReviewScore(2.4, 200)!);
});

test("the score converges on the plain average as reviews pile up", () => {
  assert.equal(bayesianReviewScore(5, 0), null, "an unreviewed server has no score, so it sorts last");
  assert.equal(bayesianReviewScore(null, 0), null);
  assert.equal(
    bayesianReviewScore(5, REVIEW_SCORE_PRIOR_COUNT),
    (5 + REVIEW_SCORE_PRIOR_AVERAGE) / 2,
    "at the prior weight the score sits halfway between the average and the prior",
  );
  assert.ok(Math.abs(bayesianReviewScore(5, 100_000)! - 5) < 0.01);
  // Adding reviews at the same average only ever moves the score towards it, never past it.
  let previous = bayesianReviewScore(4.2, 1)!;
  for (const count of [2, 5, 20, 100, 500]) {
    const score = bayesianReviewScore(4.2, count)!;
    assert.ok(score > previous && score < 4.2);
    previous = score;
  }
});

test("the catalog orders by the shared bayesian score instead of the raw average", () => {
  const { sql, params } = new PgDialect().sqlToQuery(reviewScoreSql());

  assert.equal(params.length, 0, "the prior is inlined, so ordering needs no bound parameters");
  assert.match(sql, /sum\(sr\.rating\)::numeric \+ 35/);
  assert.match(sql, /count\(\*\) \+ 10/);
  assert.match(sql, /sr\.status = 'published'/);

  const queries = readFileSync(path.resolve("src/lib/servers/queries.ts"), "utf8");
  assert.ok(!queries.includes("avg(sr.rating)"), "no catalog ordering should fall back to the plain average");
  assert.equal(queries.match(/reviewScoreSql\(\)/g)?.length, 3, "table sort and both catalog paths share the score");
});
