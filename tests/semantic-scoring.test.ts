import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_SHOW_THRESHOLD,
  batched,
  rankScores,
  scoreCatalog,
  type SemanticScorer,
  type ServerScore,
} from "@/lib/search/semantic";
import {
  buildServerProfile,
  identifyProfile,
  playerBand,
  serverProfileHash,
  type ServerProfileSource,
} from "@/lib/servers/server-profiles";

function source(overrides: Partial<ServerProfileSource> = {}): ServerProfileSource {
  return {
    id: "server-1",
    name: "Cubusfera",
    description: "Un servidor técnico para automatizar y compartir diseños.",
    country: "es",
    accessType: "open",
    accountMode: "premium_only",
    gameModes: ["tecnico"],
    editions: ["java"],
    monitorVersion: "1.21",
    playersCurrent: 12,
    playersMax: 100,
    healthStatus: "online",
    ...overrides,
  };
}

/** Answers with whatever the test decided, and records exactly which servers were asked about. */
function recordingScorer(answer: (id: string) => number | undefined) {
  const asked: string[][] = [];
  const scorer: SemanticScorer = async (_query, batch) => {
    asked.push(batch.map((entry) => entry.serverId));
    return {
      scores: batch.flatMap((entry) => {
        const score = answer(entry.serverId);
        return score === undefined ? [] : [{ serverId: entry.serverId, score, profileHash: entry.profileHash }];
      }),
      model: "jev-test",
    };
  };
  return { asked, scorer };
}

test("the profile carries what a server is and never what people think of it", () => {
  const profile = buildServerProfile(source());

  assert.equal(profile.nombre, "Cubusfera");
  assert.deepEqual(profile.modalidades, ["Técnico"], "labels, not slugs: a query is compared against words");
  assert.equal(profile.pais, "España");
  assert.deepEqual(profile.jugadores, { actuales: 12, maximo: 100 });

  // The invariant this whole module exists to hold: opinions are not part of what a server is.
  const serialized = JSON.stringify(profile);
  for (const forbidden of ["review", "rating", "valoracion", "opinion", "estrella"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false, `the profile leaked ${forbidden}`);
  }
  // Nor identifiers, which carry no meaning the description does not already carry.
  assert.equal(serialized.includes("server-1"), false, "the id travels beside the profile, not inside it");
});

test("a profile hash changes with the description but not with every player count", () => {
  const base = identifyProfile(source());

  const edited = identifyProfile(source({ description: "Ahora es una comunidad pequeña y relajada." }));
  assert.notEqual(edited.profileHash, base.profileHash, "an edited description is a different question");

  // Players move constantly; re-scoring the catalog several times an hour would buy nothing.
  const drifted = identifyProfile(source({ playersCurrent: 14 }));
  assert.equal(drifted.profileHash, base.profileHash, "a drift inside a band is not a change");

  const grew = identifyProfile(source({ playersCurrent: 300 }));
  assert.notEqual(grew.profileHash, base.profileHash, "crossing a band is a change worth re-asking");

  assert.equal(playerBand(null), "desconocido");
  assert.notEqual(playerBand(0), playerBand(300));
  assert.equal(serverProfileHash(buildServerProfile(source())), base.profileHash, "the hash is stable");
});

test("only servers whose cached score belongs to their current profile are reused", async () => {
  const profiles = [
    identifyProfile(source({ id: "a" })),
    identifyProfile(source({ id: "b" })),
    identifyProfile(source({ id: "c", description: "Comunidad pequeña y tranquila." })),
  ];
  const cached: ServerScore[] = [
    { serverId: "a", score: 0.91, profileHash: profiles[0].profileHash },
    { serverId: "b", score: 0.4, profileHash: "stale-hash" },
  ];
  const jev = recordingScorer(() => 0.8);

  const result = await scoreCatalog("comunidad pequeña", profiles, { scorer: jev.scorer, cached, batchSize: 10 });

  assert.deepEqual(jev.asked, [["b", "c"]], "the fresh score is reused; the stale one and the new server are asked");
  assert.equal(result.scores.find((entry) => entry.serverId === "a")?.score, 0.91, "the reused score is kept as it was");
  assert.deepEqual(result.fresh.map((entry) => entry.serverId), ["b", "c"], "only new judgements are worth caching");
  assert.equal(result.model, "jev-test", "the cache records which model judged, not a hardcoded name");
  assert.equal(result.partial, false);
});

test("a repeated query costs nothing at all", async () => {
  const profiles = [identifyProfile(source({ id: "a" })), identifyProfile(source({ id: "b" }))];
  const cached = profiles.map((entry) => ({ serverId: entry.serverId, score: 0.7, profileHash: entry.profileHash }));
  const jev = recordingScorer(() => 0.1);

  const result = await scoreCatalog("lo mismo de antes", profiles, { scorer: jev.scorer, cached });

  assert.deepEqual(jev.asked, [], "nothing was asked");
  assert.deepEqual(result.fresh, []);
  assert.equal(result.scores.length, 2);
});

test("a failed batch costs its own servers their score and nothing else", async () => {
  const profiles = Array.from({ length: 6 }, (_, index) => identifyProfile(source({ id: `s${index}` })));
  let call = 0;
  const scorer: SemanticScorer = async (_query, batch) => {
    call += 1;
    // The first batch times out; the rest answer.
    if (call === 1) return null;
    return { scores: batch.map((entry) => ({ serverId: entry.serverId, score: 0.8, profileHash: entry.profileHash })), model: "jev-test" };
  };

  const result = await scoreCatalog("algo", profiles, { scorer, batchSize: 2, concurrency: 1 });

  assert.equal(result.partial, true, "the caller must know the ranking is incomplete");
  assert.equal(result.scores.length, 4, "the two servers in the failed batch have no score");
  assert.equal(result.scores.some((entry) => entry.serverId === "s0"), false);
});

test("every batch failing is an empty ranking, not an error", async () => {
  const profiles = [identifyProfile(source({ id: "a" }))];

  const result = await scoreCatalog("algo", profiles, { scorer: async () => null });

  assert.deepEqual(result.scores, []);
  assert.equal(result.partial, true);
});

test("a server the model declined to answer about is dropped, not scored zero", async () => {
  const profiles = [identifyProfile(source({ id: "a" })), identifyProfile(source({ id: "b" }))];
  const jev = recordingScorer((id) => (id === "a" ? 0.95 : undefined));

  const result = await scoreCatalog("algo", profiles, { scorer: jev.scorer });

  assert.deepEqual(result.scores.map((entry) => entry.serverId), ["a"]);
});

test("the deadline stops asking rather than abandoning answers already paid for", async () => {
  const profiles = Array.from({ length: 10 }, (_, index) => identifyProfile(source({ id: `s${index}` })));
  let clock = 0;
  const asked: string[] = [];
  const scorer: SemanticScorer = async (_query, batch) => {
    asked.push(...batch.map((entry) => entry.serverId));
    clock += 100; // every request costs 100ms of the budget
    return { scores: batch.map((entry) => ({ serverId: entry.serverId, score: 0.8, profileHash: entry.profileHash })), model: "jev-test" };
  };

  const result = await scoreCatalog("algo", profiles, {
    scorer, batchSize: 1, concurrency: 1, deadlineMs: 350, now: () => clock,
  });

  assert.equal(asked.length, 4, "it stops picking up work once the budget is spent");
  assert.equal(result.scores.length, 4, "and keeps every answer it did pay for");
  assert.equal(result.partial, true, "the caller must know the ranking is incomplete");
});

test("no deadline means score everything", async () => {
  const profiles = Array.from({ length: 5 }, (_, index) => identifyProfile(source({ id: `s${index}` })));
  const jev = recordingScorer(() => 0.7);

  const result = await scoreCatalog("algo", profiles, { scorer: jev.scorer, batchSize: 1, concurrency: 2 });

  assert.equal(result.scores.length, 5);
  assert.equal(result.partial, false);
});

test("the threshold decides what is shown and the score decides the order", () => {
  const scores: ServerScore[] = [
    { serverId: "bajo", score: 0.2, profileHash: "h" },
    { serverId: "alto", score: 0.94, profileHash: "h" },
    { serverId: "medio", score: 0.61, profileHash: "h" },
    { serverId: "justo", score: DEFAULT_SHOW_THRESHOLD, profileHash: "h" },
  ];

  const ranking = rankScores(scores);
  assert.deepEqual(ranking.scores.map((entry) => entry.serverId), ["alto", "medio", "justo"]);
  assert.equal(ranking.approximate, false, "something cleared the threshold, so nothing is approximate");
  // The band edge belongs to the more confident outcome, as it does for the facet bands.
  assert.deepEqual(rankScores(scores, 0.9).scores.map((entry) => entry.serverId), ["alto"]);
});

test("a weak field shows its best few rather than an empty page", () => {
  // Measured: judged one at a time, "pocos miembros" peaked at 0.44 on the seed. A fixed threshold
  // would have answered a perfectly rankable query with nothing at all.
  const scores: ServerScore[] = [
    { serverId: "mejor", score: 0.44, profileHash: "h" },
    { serverId: "segundo", score: 0.31, profileHash: "h" },
    { serverId: "tercero", score: 0.05, profileHash: "h" },
  ];

  const ranking = rankScores(scores, 0.5, 2);
  assert.deepEqual(ranking.scores.map((entry) => entry.serverId), ["mejor", "segundo"], "the best few, in order");
  assert.equal(ranking.approximate, true, "and the interface must be able to say so");
});

test("a judgement of no is not a weak yes", () => {
  // Zero means the model decided the server does not match. Showing it would invent a result.
  const ranking = rankScores([{ serverId: "no", score: 0, profileHash: "h" }], 0.5);

  assert.deepEqual(ranking.scores, []);
  assert.equal(ranking.approximate, false, "there is nothing to be approximate about");
});

test("ties resolve the same way twice, so one query is one order", () => {
  const scores: ServerScore[] = [
    { serverId: "zeta", score: 0.8, profileHash: "h" },
    { serverId: "alfa", score: 0.8, profileHash: "h" },
  ];

  assert.deepEqual(rankScores(scores).scores.map((entry) => entry.serverId), ["alfa", "zeta"]);
  assert.deepEqual(rankScores([...scores].reverse()).scores.map((entry) => entry.serverId), ["alfa", "zeta"]);
});

test("one server per request is the default, because batching changed the answers", () => {
  // Guards the measured decision: batches of fifteen scored the same servers differently, which
  // would make a cached score depend on which servers it travelled with.
  assert.equal(DEFAULT_BATCH_SIZE, 1);
});

test("batching covers every server exactly once, whatever the size", () => {
  const items = Array.from({ length: 300 }, (_, index) => index);

  for (const size of [1, 7, 15, 300, 1000]) {
    const batches = batched(items, size);
    assert.deepEqual(batches.flat(), items, `size ${size} must lose nothing and reorder nothing`);
    assert.ok(batches.every((batch) => batch.length <= Math.max(1, size)), `size ${size} overfilled a batch`);
  }

  // Three hundred servers in fifteens is twenty requests: the number that decides the latency.
  assert.equal(batched(items, 15).length, 20);
  assert.deepEqual(batched([], 15), []);
});
