import assert from "node:assert/strict";
import { test } from "node:test";

import { daysLeftLabel, monthlyReset, normalizeNickname, previousVotingMonth, startOfVotingDay, VOTE_COOLDOWN_MS, votingMonth } from "@/lib/votes/month";

test("the month turns over at midnight in Madrid, not in UTC", () => {
  // 22:30 UTC on 30 September is 00:30 on 1 October in Madrid (summer time, UTC+2).
  assert.equal(votingMonth(new Date("2026-09-30T22:30:00Z")), "2026-10");
  assert.equal(votingMonth(new Date("2026-09-30T21:59:59Z")), "2026-09");
  // In winter Madrid is UTC+1.
  assert.equal(votingMonth(new Date("2026-12-31T23:00:00Z")), "2027-01");
  assert.equal(votingMonth(new Date("2026-12-31T22:59:59Z")), "2026-12");
});

test("the previous month wraps across the year", () => {
  assert.equal(previousVotingMonth("2027-01"), "2026-12");
  assert.equal(previousVotingMonth("2026-10"), "2026-09");
});

test("the reset is the next 1st at Madrid midnight, with the days left counting today", () => {
  const reset = monthlyReset(new Date("2026-09-27T10:00:00Z"));
  assert.equal(reset.month, "2026-09");
  assert.equal(reset.daysLeft, 4);
  assert.equal(reset.resetsAt.toISOString(), "2026-09-30T22:00:00.000Z");
  assert.equal(reset.monthName, "septiembre");
  assert.equal(reset.previousMonthName, "agosto");
  assert.equal(reset.resetLabel, "1 de octubre");

  const december = monthlyReset(new Date("2026-12-31T12:00:00Z"));
  assert.equal(december.daysLeft, 1);
  assert.equal(december.resetsAt.toISOString(), "2026-12-31T23:00:00.000Z");
  assert.equal(december.resetLabel, "1 de enero");
  assert.equal(daysLeftLabel(1), "queda 1 día");
  assert.equal(daysLeftLabel(4), "quedan 4 días");
});

test("today starts at Madrid midnight on both sides of a clock change", () => {
  // 25 October 2026: Madrid falls back from UTC+2 to UTC+1 at 03:00.
  assert.equal(startOfVotingDay(new Date("2026-10-25T12:00:00Z")).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(startOfVotingDay(new Date("2026-10-26T12:00:00Z")).toISOString(), "2026-10-25T23:00:00.000Z");
});

test("the cooldown is 23 hours", () => {
  assert.equal(VOTE_COOLDOWN_MS, 23 * 60 * 60 * 1000);
});

test("nicknames follow Java's rules and share a case-insensitive key", () => {
  assert.deepEqual(normalizeNickname("  Kiroo_ "), { nickname: "Kiroo_", key: "kiroo_" });
  assert.equal(normalizeNickname("ab"), null);
  assert.equal(normalizeNickname("a".repeat(17)), null);
  assert.equal(normalizeNickname("con espacio"), null);
  assert.equal(normalizeNickname("line\nbreak"), null);
  assert.equal(normalizeNickname("ñandú"), null);
  assert.equal(normalizeNickname(undefined), null);
});
