import assert from "node:assert/strict";
import test from "node:test";

import { interpretSearchQuery, type InterpretDeps } from "@/lib/search/interpret";
import type { JevReading } from "@/lib/search/jev";
import type { CachedInterpretation, SearchCacheStore } from "@/lib/search/cache";

/** Records what the pipeline asked Jev, and answers with whatever the test wants. */
function recordingAsk(answer: JevReading | null) {
  const asked: string[] = [];
  return {
    asked,
    ask: async (query: string) => {
      asked.push(query);
      return answer;
    },
  };
}

function failingAsk(error: Error) {
  const asked: string[] = [];
  return {
    asked,
    // The real reader never throws: it turns a timeout, a 429 or an overloaded service into null.
    ask: async (query: string) => {
      asked.push(query);
      void error;
      return null;
    },
  };
}

/** A cache that stamps each row with the clock the test is running, like Postgres would. */
function memoryCache(now: () => Date = () => new Date("2026-09-21T12:00:00.000Z")) {
  const rows = new Map<string, { interpretation: CachedInterpretation; storedAt: Date }>();
  const writes: Array<{ hash: string; query: string }> = [];
  const store: SearchCacheStore = {
    read: async (hash) => rows.get(hash) ?? null,
    write: async (hash, query, interpretation) => {
      writes.push({ hash, query });
      rows.set(hash, { interpretation, storedAt: now() });
    },
  };
  return { store, rows, writes };
}

const confident: JevReading = {
  model: "jev-1.13.0",
  modes: [{ slug: "tecnico", confidence: 0.96 }],
  country: { code: "es", confidence: 0.94 },
  region: null,
  access: null,
  edition: null,
  nameSearchProbability: 0.05,
};

test("an empty query asks nothing and filters nothing", async () => {
  const jev = recordingAsk(confident);

  const result = await interpretSearchQuery("   ", { ask: jev.ask });

  assert.equal(result.source, "empty");
  assert.deepEqual(result.filters, { modes: [], countries: [], access: [] });
  assert.equal(result.keyword, "");
  assert.deepEqual(jev.asked, [], "an empty box must never reach the model");
});

test("a query the dictionary understands never reaches Jev", async () => {
  const jev = recordingAsk(confident);

  const result = await interpretSearchQuery("servidores de survival en España", { ask: jev.ask });

  assert.equal(result.source, "dictionary");
  assert.deepEqual(result.filters, { modes: ["survival"], countries: ["es"], access: [] });
  assert.equal(result.keyword, "", "the filters replace the text they came from");
  assert.deepEqual(jev.asked, []);
});

test("a confident reading becomes the filters, and the query string drops the text", async () => {
  const jev = recordingAsk(confident);

  const result = await interpretSearchQuery("algo con granjas automaticas tipo redstone tranquilo", { ask: jev.ask });

  assert.equal(result.source, "jev");
  assert.deepEqual(result.filters, { modes: ["tecnico"], countries: ["es"], access: [] });
  assert.equal(result.keyword, "");
  assert.equal(jev.asked.length, 1);
  assert.equal(jev.asked[0], jev.asked[0].toLowerCase(), "Jev sees the normalized query, so the cache key and the question agree");
});

test("a middling reading is offered rather than imposed", async () => {
  const jev = recordingAsk({
    model: "jev-1.13.0",
    modes: [{ slug: "roleplay", confidence: 0.62 }],
    country: { code: "mx", confidence: 0.55 },
    region: null,
    access: null,
    edition: null,
    nameSearchProbability: 0.1,
  });

  const result = await interpretSearchQuery("algo para interpretar personajes con calma", { ask: jev.ask });

  assert.deepEqual(result.filters, { modes: [], countries: [], access: [] }, "nothing is applied from the middle band");
  assert.deepEqual(result.suggested, [
    { kind: "mode", value: "roleplay", confidence: 0.62 },
    { kind: "country", value: "mx", confidence: 0.55 },
  ]);
  assert.equal(result.source, "keyword", "with no filters to apply, the keyword search runs");
  assert.equal(result.keyword, "algo para interpretar personajes con calma");
});

test("an unconfident reading is ignored and the keyword search takes over", async () => {
  const jev = recordingAsk({
    model: "jev-1.13.0",
    modes: [{ slug: "survival", confidence: 0.2 }],
    country: { code: "ar", confidence: 0.31 },
    region: null,
    access: null,
    edition: null,
    nameSearchProbability: 0.2,
  });

  const result = await interpretSearchQuery("algo diferente y original", { ask: jev.ask });

  assert.equal(result.source, "keyword");
  assert.deepEqual(result.filters, { modes: [], countries: [], access: [] });
  assert.deepEqual(result.suggested, []);
  assert.equal(result.keyword, "algo diferente y original");
});

test("a query that names a server keeps the keyword search and demotes the filters to chips", async () => {
  const jev = recordingAsk({
    model: "jev-1.13.0",
    modes: [{ slug: "skyblock", confidence: 0.97 }],
    country: null,
    region: null,
    access: null,
    edition: null,
    nameSearchProbability: 0.88,
  });

  const result = await interpretSearchQuery("hypixel skyblock", { ask: jev.ask });

  assert.equal(result.source, "keyword");
  assert.equal(result.keyword, "hypixel skyblock");
  assert.deepEqual(result.filters, { modes: [], countries: [], access: [] });
  assert.deepEqual(result.suggested, [{ kind: "mode", value: "skyblock", confidence: 1 }]);
});

test("every way Jev can fail lands on the keyword search, never on an error", async () => {
  const failures = [
    new Error("The operation was aborted due to timeout"),
    Object.assign(new Error("429 Too Many Requests"), { name: "RateLimitError" }),
    Object.assign(new Error("529 Overloaded"), { name: "InternalServerError" }),
    Object.assign(new Error("401 Unauthorized"), { name: "AuthenticationError" }),
    Object.assign(new Error("fetch failed"), { name: "APIConnectionError" }),
  ];

  for (const failure of failures) {
    const jev = failingAsk(failure);
    const result = await interpretSearchQuery("servidores tranquilos sin lag", { ask: jev.ask });

    assert.equal(result.source, "keyword", `${failure.name} should fall back`);
    assert.equal(result.keyword, "servidores tranquilos sin lag");
    assert.deepEqual(result.filters, { modes: [], countries: [], access: [] });
    assert.equal(jev.asked.length, 1);
  }
});

test("a refused budget skips Jev entirely and searches by keyword", async () => {
  const jev = recordingAsk(confident);
  const cache = memoryCache();

  const result = await interpretSearchQuery("algo raro que nadie ha escrito antes", {
    ask: jev.ask,
    cache: cache.store,
    allowInference: async () => false,
  });

  assert.equal(result.source, "keyword");
  assert.deepEqual(jev.asked, [], "the ceiling must be checked before the call, not after");
  assert.deepEqual(cache.writes, []);
});

test("a word Jev cannot be asked about does not cost the filters the dictionary already found", async () => {
  // The reported failure: "survival" filters, "survival para pros" found nothing at all, because
  // the unplaceable "pros" sent the query to Jev and the fallback dropped the mode on the way out.
  for (const unavailable of [
    { name: "a refused budget", deps: { ask: recordingAsk(confident).ask, allowInference: async () => false } },
    { name: "a failed call", deps: { ask: failingAsk(new Error("fetch failed")).ask } },
  ] satisfies Array<{ name: string; deps: InterpretDeps }>) {
    const result = await interpretSearchQuery("survival para pros", unavailable.deps);

    assert.deepEqual(result.filters, { modes: ["survival"], countries: [], access: [] }, `${unavailable.name} must keep the dictionary's mode`);
    assert.equal(result.source, "dictionary");
    assert.equal(result.keyword, "", "filtering by survival beats searching for the whole phrase");
  }
});

test("with nothing in the dictionary either, an unavailable Jev still falls back to keywords", async () => {
  const result = await interpretSearchQuery("algo raro que nadie ha escrito antes", {
    ask: recordingAsk(confident).ask,
    allowInference: async () => false,
  });

  assert.equal(result.source, "keyword");
  assert.deepEqual(result.filters, { modes: [], countries: [], access: [] });
  assert.equal(result.keyword, "algo raro que nadie ha escrito antes");
});

test("a fresh cache entry answers without asking again", async () => {
  const jev = recordingAsk(confident);
  const cache = memoryCache();
  const deps: InterpretDeps = { ask: jev.ask, cache: cache.store, now: () => new Date("2026-09-21T12:00:00.000Z") };

  const first = await interpretSearchQuery("granjas automaticas y mucha redstone dificil", deps);
  const second = await interpretSearchQuery("¡GRANJAS automáticas y mucha redstone difícil!", deps);

  assert.equal(first.source, "jev");
  assert.equal(second.source, "cache", "the normalized query is the key, so punctuation and case hit the same row");
  assert.deepEqual(second.filters, first.filters);
  assert.equal(jev.asked.length, 1);
  assert.equal(cache.writes.length, 1);
});

test("an entry past its TTL is asked again", async () => {
  const jev = recordingAsk(confident);
  const stored = new Date("2026-09-18T12:00:00.000Z");
  const cache = memoryCache(() => stored);
  const deps: InterpretDeps = { ask: jev.ask, cache: cache.store, ttlHours: 24, now: () => stored };

  await interpretSearchQuery("granjas automaticas raras", deps);
  assert.equal(jev.asked.length, 1);

  const later = await interpretSearchQuery("granjas automaticas raras", { ...deps, now: () => new Date("2026-09-21T12:00:00.000Z") });
  assert.equal(later.source, "jev");
  assert.equal(jev.asked.length, 2, "a stale reading is not reused");
});

test("what the dictionary knows survives a reading that contradicts it", async () => {
  const jev = recordingAsk({
    model: "jev-1.13.0",
    modes: [{ slug: "creativo", confidence: 0.95 }],
    country: { code: "mx", confidence: 0.99 },
    region: null,
    access: null,
    edition: null,
    nameSearchProbability: 0.05,
  });

  // "españa" is exact; the country Jev inferred from the rest of the sentence does not overrule it.
  const result = await interpretSearchQuery("españa para construir cosas enormes sin prisa", { ask: jev.ask });

  assert.deepEqual(result.filters.countries, ["es"]);
  assert.deepEqual(result.filters.modes, ["creativo"], "an inferred mode still joins an exact country");
});

test("a query resolved to nothing is still remembered, so it is not re-asked all day", async () => {
  const jev = recordingAsk({ model: "jev-1.13.0", modes: [], country: null, region: null, access: null, edition: null, nameSearchProbability: 0.1 });
  const cache = memoryCache();
  const deps: InterpretDeps = { ask: jev.ask, cache: cache.store, now: () => new Date("2026-09-21T12:00:00.000Z") };

  const first = await interpretSearchQuery("asdfgh qwerty", deps);
  const second = await interpretSearchQuery("asdfgh qwerty", deps);

  assert.equal(first.source, "keyword");
  assert.equal(second.source, "keyword");
  assert.equal(jev.asked.length, 1);
  assert.equal(cache.writes.length, 1);
});
