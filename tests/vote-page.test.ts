import assert from "node:assert/strict";
import test from "node:test";

import {
  cooldownProgress,
  countdownSummary,
  deliveryLine,
  elapsedLabel,
  nextVoteLabel,
  pad2,
  rankLine,
  splitRemaining,
  successSentence,
} from "@/lib/votes/vote-copy";

const HOUR = 60 * 60 * 1000;

test("splitRemaining rounds seconds up and never goes negative", () => {
  assert.deepEqual(splitRemaining(5 * HOUR + 3 * 60_000 + 1_500), { hours: 5, minutes: 3, seconds: 2 });
  assert.deepEqual(splitRemaining(-10_000), { hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(splitRemaining(23 * HOUR), { hours: 23, minutes: 0, seconds: 0 });
  assert.equal(pad2(7), "07");
  assert.equal(pad2(23), "23");
});

test("countdownSummary reads to the minute with Spanish plurals", () => {
  assert.equal(countdownSummary(5 * HOUR + 3 * 60_000 + 20_000), "5 horas y 3 minutos");
  assert.equal(countdownSummary(HOUR + 60_000), "1 hora y 1 minuto");
  assert.equal(countdownSummary(2 * HOUR), "2 horas");
  assert.equal(countdownSummary(12 * 60_000), "12 minutos");
  assert.equal(countdownSummary(30_000), "menos de un minuto");
  assert.equal(countdownSummary(0), "ya puedes votar");
});

test("elapsedLabel shows hours and minutes since the vote", () => {
  const votedAt = new Date("2026-09-27T10:00:00Z");
  assert.equal(elapsedLabel(votedAt, new Date("2026-09-27T13:12:40Z")), "hace 3 h 12 min");
  assert.equal(elapsedLabel(votedAt, new Date("2026-09-27T12:00:00Z")), "hace 2 h");
  assert.equal(elapsedLabel(votedAt, new Date("2026-09-27T10:25:00Z")), "hace 25 min");
  assert.equal(elapsedLabel(votedAt, new Date("2026-09-27T10:00:30Z")), "hace un momento");
});

test("nextVoteLabel uses Madrid's clock and says hoy or mañana", () => {
  // 27 Sept 2026 is summer time in Madrid (UTC+2).
  const now = new Date("2026-09-27T10:00:00Z");
  assert.equal(nextVoteLabel(new Date("2026-09-28T09:00:00Z"), now), "mañana a las 11:00");
  assert.equal(nextVoteLabel(new Date("2026-09-27T20:05:00Z"), now), "hoy a las 22:05");
  // 22:30 UTC is already the next day in Madrid.
  assert.equal(nextVoteLabel(new Date("2026-09-27T22:30:00Z"), now), "mañana a las 00:30");
  assert.equal(nextVoteLabel(new Date("2026-09-30T08:00:00Z"), now), "el miércoles a las 10:00");
});

test("rankLine and successSentence handle ranked, unranked and singular totals", () => {
  assert.equal(rankLine(3, "septiembre", 12040), "#3 en septiembre · 12.040 votos");
  assert.equal(rankLine(null, "septiembre", 1), "1 voto en septiembre");
  assert.equal(
    successSentence({ nickname: "Notch", serverName: "Mundo", votes: 42, position: 5, monthName: "septiembre" }),
    "Gracias, Notch. Mundo suma ahora 42 votos y va 5.º en septiembre.",
  );
  assert.equal(
    successSentence({ nickname: "Steve_1", serverName: "Mundo", votes: 1, position: null, monthName: "octubre" }),
    "Gracias, Steve_1. Mundo suma ahora 1 voto en octubre.",
  );
});

test("deliveryLine only speaks when the server has Votifier set up", () => {
  assert.equal(deliveryLine("delivered"), "Recompensa enviada al servidor");
  assert.match(deliveryLine("failed") ?? "", /tu voto cuenta/);
  assert.equal(deliveryLine("not_configured"), null);
});

test("cooldownProgress is clamped between 0 and 1", () => {
  const votedAt = new Date("2026-09-27T00:00:00Z");
  const next = new Date(votedAt.getTime() + 23 * HOUR);
  assert.equal(cooldownProgress(votedAt, next, votedAt), 0);
  assert.equal(cooldownProgress(votedAt, next, new Date(votedAt.getTime() + 11.5 * HOUR)), 0.5);
  assert.equal(cooldownProgress(votedAt, next, new Date(next.getTime() + HOUR)), 1);
  assert.equal(cooldownProgress(votedAt, votedAt, votedAt), 1);
});
