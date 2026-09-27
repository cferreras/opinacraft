import assert from "node:assert/strict";
import test from "node:test";

import { rankTrend, voteAgoLabel, votesThisMonthLabel } from "../src/lib/votes/rank-copy.ts";

test("describes the month-over-month move in the ranking", () => {
  assert.deepEqual(rankTrend(3, 7, "agosto"), { direction: "up", label: "Sube 4 puestos respecto a agosto" });
  assert.deepEqual(rankTrend(5, 4, "agosto"), { direction: "down", label: "Baja 1 puesto respecto a agosto" });
  assert.deepEqual(rankTrend(2, 2, "diciembre"), { direction: "same", label: "Igual que en diciembre" });
});

test("omits the trend when either month has no position", () => {
  assert.equal(rankTrend(3, null, "agosto"), null);
  assert.equal(rankTrend(null, 3, "agosto"), null);
});

test("pluralises this month's votes", () => {
  assert.equal(votesThisMonthLabel(1), "voto este mes");
  assert.equal(votesThisMonthLabel(0), "votos este mes");
  assert.equal(votesThisMonthLabel(12), "votos este mes");
});

test("says how long ago the account voted", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  assert.equal(voteAgoLabel(new Date("2026-09-27T11:40:00Z"), now), "hace menos de 1 h");
  assert.equal(voteAgoLabel(new Date("2026-09-27T09:00:00Z"), now), "hace 3 h");
  assert.equal(voteAgoLabel(new Date("2026-09-26T12:30:00Z"), now), "hace 23 h");
});

test("falls back to the Spanish calendar date after a day", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  assert.equal(voteAgoLabel(new Date("2026-09-04T10:00:00Z"), now), "el 4 de septiembre");
  // 23:30 UTC on the 31st is already the 1st in Madrid.
  assert.equal(voteAgoLabel(new Date("2026-08-31T23:30:00Z"), now), "el 1 de septiembre");
});
