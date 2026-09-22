import assert from "node:assert/strict";
import test from "node:test";

import { claimJevCall, jevBudgetKey, type RateLimitConsumer } from "@/lib/search/budget";
import { APPLY_CONFIDENCE, SUGGEST_CONFIDENCE, bandReading, hasFilters } from "@/lib/search/bands";
import { NO_ACCESS_OPTION, NO_COUNTRY_OPTION, NO_EDITION_OPTION, NO_MODE_OPTION, readAnswers, type SearchAnswers } from "@/lib/search/jev";
import { isGameModeSlug } from "@/lib/servers/game-modes";
import { isServerCountryCode, isServerRegionCode } from "@/lib/servers/countries";
import { isCatalogAccessIntent, isCatalogEdition } from "@/lib/servers/catalog-filters";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stands in for the Postgres limiter, with the same "throws past the ceiling" contract. */
function countingConsumer(limit: number) {
  const calls: Array<{ key: string; limit: number; windowMs: number }> = [];
  const counts = new Map<string, number>();

  const consume: RateLimitConsumer = async (key, keyLimit, windowMs) => {
    calls.push({ key, limit: keyLimit, windowMs });
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next > limit) {
      const error = new Error("limit reached");
      error.name = "RateLimitExceededError";
      throw error;
    }
  };

  return { consume, calls };
}

test("the daily ceiling counts one bucket per UTC day", () => {
  assert.equal(jevBudgetKey(new Date("2026-09-21T00:00:00.000Z")), "jev:daily:2026-09-21");
  assert.equal(jevBudgetKey(new Date("2026-09-21T23:59:59.999Z")), "jev:daily:2026-09-21");
  assert.notEqual(jevBudgetKey(new Date("2026-09-22T00:00:00.000Z")), jevBudgetKey(new Date("2026-09-21T12:00:00.000Z")));
});

test("calls inside the allowance are counted and let through", async () => {
  const { consume, calls } = countingConsumer(3);
  const now = new Date("2026-09-21T10:00:00.000Z");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assert.equal(await claimJevCall({ limit: 3, consume, now }), true, `call ${attempt} is within the ceiling`);
  }

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], { key: "jev:daily:2026-09-21", limit: 3, windowMs: DAY_MS });
});

test("the call past the ceiling falls back instead of spending", async () => {
  const { consume } = countingConsumer(2);
  const now = new Date("2026-09-21T10:00:00.000Z");
  const refusals: string[] = [];

  assert.equal(await claimJevCall({ limit: 2, consume, now }), true);
  assert.equal(await claimJevCall({ limit: 2, consume, now }), true);
  assert.equal(await claimJevCall({ limit: 2, consume, now, onRefused: (reason) => refusals.push(reason) }), false);
  assert.deepEqual(refusals, ["limit"]);
});

test("the allowance starts again the next day", async () => {
  const { consume } = countingConsumer(1);

  assert.equal(await claimJevCall({ limit: 1, consume, now: new Date("2026-09-21T23:00:00.000Z") }), true);
  assert.equal(await claimJevCall({ limit: 1, consume, now: new Date("2026-09-21T23:30:00.000Z") }), false);
  assert.equal(await claimJevCall({ limit: 1, consume, now: new Date("2026-09-22T00:30:00.000Z") }), true, "a new day is a new bucket");
});

test("a broken counter refuses the call rather than spending without a ceiling", async () => {
  const refusals: string[] = [];
  const consume: RateLimitConsumer = async () => {
    throw new Error("connection terminated unexpectedly");
  };

  assert.equal(await claimJevCall({ limit: 5000, consume, onRefused: (reason) => refusals.push(reason) }), false);
  assert.deepEqual(refusals, ["unavailable"]);
});

test("a ceiling of zero or less disables inference without touching the counter", async () => {
  let consumed = 0;
  const consume: RateLimitConsumer = async () => { consumed += 1; };

  assert.equal(await claimJevCall({ limit: 0, consume }), false);
  assert.equal(await claimJevCall({ limit: -1, consume }), false);
  assert.equal(await claimJevCall({ limit: Number.NaN, consume }), false);
  assert.equal(consumed, 0);
});

test("the confidence bands apply, suggest and ignore at the documented thresholds", () => {
  const banded = bandReading({
    model: "jev-1.13.0",
    modes: [
      { slug: "survival", confidence: 0.95 },
      { slug: "economia", confidence: 0.7 },
    ],
    country: { code: "es", confidence: 0.3 },
    region: null,
    access: null,
    edition: null,
    nameSearchProbability: 0,
  });

  assert.deepEqual(banded.applied.modes, ["survival"], "high confidence is applied");
  assert.deepEqual(banded.applied.countries, [], "low confidence is ignored");
  assert.deepEqual(banded.suggested, [{ kind: "mode", value: "economia", confidence: 0.7 }], "the middle band is offered");
  assert.equal(banded.namesServer, false);
});

test("a confident region becomes the countries it covers, and a middling one stays one chip", () => {
  const applied = bandReading({
    model: "m", modes: [], country: null,
    region: { code: "latam", confidence: 0.95 },
    access: null, edition: null, nameSearchProbability: 0,
  });
  assert.ok(applied.applied.countries.length > 10, "a region is a filter over many countries");
  assert.equal(applied.applied.countries.includes("es"), false);
  assert.deepEqual(applied.suggested, []);

  const offered = bandReading({
    model: "m", modes: [], country: null,
    region: { code: "latam", confidence: 0.6 },
    access: null, edition: null, nameSearchProbability: 0,
  });
  assert.deepEqual(offered.applied.countries, []);
  // Eighteen dismissable country chips would be a worse offer than one region chip.
  assert.deepEqual(offered.suggested, [{ kind: "region", value: "latam", confidence: 0.6 }]);
});

test("access and edition pass through the same bands as everything else", () => {
  const banded = bandReading({
    model: "m", modes: [], country: null, region: null,
    access: { intent: "no-premium", confidence: 0.93 },
    edition: { value: "bedrock", confidence: 0.6 },
    nameSearchProbability: 0,
  });

  assert.deepEqual(banded.applied.access, ["non-premium", "semi-premium"], "one intent, both stored values");
  assert.equal(banded.applied.edition, undefined, "the middle band is offered, not applied");
  assert.deepEqual(banded.suggested, [{ kind: "edition", value: "bedrock", confidence: 0.6 }]);
});

test("the band edges belong to the more confident outcome", () => {
  const atApply = bandReading({ model: "m", modes: [{ slug: "pvp", confidence: APPLY_CONFIDENCE }], country: null, region: null, access: null, edition: null, nameSearchProbability: 0 });
  assert.deepEqual(atApply.applied.modes, ["pvp"]);
  assert.deepEqual(atApply.suggested, []);

  const atSuggest = bandReading({ model: "m", modes: [{ slug: "pvp", confidence: SUGGEST_CONFIDENCE }], country: null, region: null, access: null, edition: null, nameSearchProbability: 0 });
  assert.deepEqual(atSuggest.applied.modes, []);
  assert.equal(atSuggest.suggested.length, 1);

  const belowSuggest = bandReading({ model: "m", modes: [{ slug: "pvp", confidence: SUGGEST_CONFIDENCE - 0.01 }], country: null, region: null, access: null, edition: null, nameSearchProbability: 0 });
  assert.deepEqual(belowSuggest.suggested, []);
  assert.equal(hasFilters(belowSuggest.applied), false);
});

test("the bands can be retuned without touching the pipeline", () => {
  const reading = { model: "m", modes: [{ slug: "survival", confidence: 0.7 }], country: null, region: null, access: null, edition: null, nameSearchProbability: 0 };

  assert.deepEqual(bandReading(reading, { apply: 0.6 }).applied.modes, ["survival"]);
  assert.deepEqual(bandReading(reading, { suggest: 0.8 }).suggested, []);
});

test("a high name probability is reported so the keyword search keeps its job", () => {
  const banded = bandReading({ model: "m", modes: [{ slug: "skyblock", confidence: 0.99 }], country: null, region: null, access: null, edition: null, nameSearchProbability: 0.8 });

  assert.equal(banded.namesServer, true);
  assert.deepEqual(banded.applied.modes, ["skyblock"], "the reading itself is unchanged; the policy decides what to do with it");
});

test("answers outside the catalogs cannot become filters", () => {
  const answers = {
    model: "jev-1.13.0",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: {
      // The no-match options and anything inventive are dropped on the way out.
      modalidad_principal: { type: "choice", choice: NO_MODE_OPTION, confidence: 0.99, probabilities: {} },
      modalidad_secundaria: { type: "choice", choice: "modalidad-inventada", confidence: 0.99, probabilities: {} },
      pais: { type: "choice", choice: NO_COUNTRY_OPTION, confidence: 0.99, probabilities: {} },
      acceso: { type: "choice", choice: NO_ACCESS_OPTION, confidence: 0.99, probabilities: {} },
      edicion: { type: "choice", choice: "edicion-inventada", confidence: 0.99, probabilities: {} },
      busca_por_nombre: { type: "noul", noul: 0.1 },
    },
  } as unknown as SearchAnswers;

  const reading = readAnswers(answers);
  assert.deepEqual(reading.modes, []);
  assert.equal(reading.country, null);
  assert.equal(reading.region, null);
  assert.equal(reading.access, null);
  assert.equal(reading.edition, null);
  assert.equal(reading.nameSearchProbability, 0.1);

  // The sentinels must stay impossible to confuse with a real filter value.
  assert.equal(isGameModeSlug(NO_MODE_OPTION), false);
  assert.equal(isServerCountryCode(NO_COUNTRY_OPTION), false);
  assert.equal(isServerRegionCode(NO_COUNTRY_OPTION), false);
  assert.equal(isCatalogAccessIntent(NO_ACCESS_OPTION), false);
  assert.equal(isCatalogEdition(NO_EDITION_OPTION), false);
});

test("a region answered in the country question is read as a region, not a country", () => {
  const answers = {
    model: "jev-1.13.0",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: {
      modalidad_principal: { type: "choice", choice: NO_MODE_OPTION, confidence: 0.99, probabilities: {} },
      modalidad_secundaria: { type: "choice", choice: NO_MODE_OPTION, confidence: 0.99, probabilities: {} },
      // One question, two catalogs: whichever one the answer belongs to is the field it lands in.
      pais: { type: "choice", choice: "latam", confidence: 0.92, probabilities: {} },
      acceso: { type: "choice", choice: "no-premium", confidence: 0.91, probabilities: {} },
      edicion: { type: "choice", choice: "bedrock", confidence: 0.95, probabilities: {} },
      busca_por_nombre: { type: "noul", noul: 0 },
    },
  } as unknown as SearchAnswers;

  const reading = readAnswers(answers);
  assert.equal(reading.country, null, "latam is not a country code");
  assert.deepEqual(reading.region, { code: "latam", confidence: 0.92 });
  assert.deepEqual(reading.access, { intent: "no-premium", confidence: 0.91 });
  assert.deepEqual(reading.edition, { value: "bedrock", confidence: 0.95 });
});

test("a repeated modality is not applied twice, and out-of-range numbers are clamped", () => {
  const answers = {
    model: "jev-1.13.0",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: {
      modalidad_principal: { type: "choice", choice: "survival", confidence: 1.4, probabilities: {} },
      modalidad_secundaria: { type: "choice", choice: "survival", confidence: 0.9, probabilities: {} },
      pais: { type: "choice", choice: "es", confidence: -0.2, probabilities: {} },
      busca_por_nombre: { type: "noul", noul: Number.NaN },
    },
  } as unknown as SearchAnswers;

  const reading = readAnswers(answers);
  assert.deepEqual(reading.modes, [{ slug: "survival", confidence: 1 }]);
  assert.deepEqual(reading.country, { code: "es", confidence: 0 });
  assert.equal(reading.nameSearchProbability, 0);
});
