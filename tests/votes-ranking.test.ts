import assert from "node:assert/strict";
import test from "node:test";

import { catalogRowRanking, catalogSortOptions, catalogSortOptionsFor, defaultCatalogSort, resolveCatalogSort } from "@/lib/servers/catalog-filters";

// The module opens a pool on import; nothing here queries it, so any URL will do.
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
const { opinionExcerpt, OPINION_EXCERPT_LENGTH } = await import("../src/lib/votes/featured-opinions.ts");

test("a short opinion is quoted whole, with its whitespace tidied", () => {
  assert.equal(opinionExcerpt("  Muy buen   servidor,\n\nel staff responde rápido.  "), "Muy buen servidor, el staff responde rápido.");
});

test("a long opinion is cut on a word boundary and fits with its ellipsis", () => {
  const words = "El staff responde en minutos y no hay nada de pay-to-win, llevo tres temporadas y sigo enganchado a los eventos del fin de semana con mis amigos de siempre.";
  const excerpt = opinionExcerpt(`${words} ${words}`);
  assert.ok(excerpt.length <= OPINION_EXCERPT_LENGTH, `${excerpt.length} characters`);
  assert.ok(excerpt.endsWith("…"));
  const body = excerpt.slice(0, -1);
  assert.ok(`${words} ${words}`.startsWith(body), "the excerpt is a prefix of the opinion");
  assert.match(`${words} ${words}`.slice(body.length), /^[\s,;:.]/, "the cut falls between words");
  assert.doesNotMatch(body, /[\s,;:.]$/, "no dangling space or punctuation before the ellipsis");
});

test("an opinion exactly at the limit is not cut", () => {
  const text = "a".repeat(OPINION_EXCERPT_LENGTH);
  assert.equal(opinionExcerpt(text), text);
});

test("a single word longer than the limit is cut hard", () => {
  const excerpt = opinionExcerpt(`https://example.com/${"x".repeat(300)}`);
  assert.equal(excerpt.length, OPINION_EXCERPT_LENGTH);
  assert.ok(excerpt.endsWith("…"));
});

test("the votes order leads the menu only with votes on", () => {
  assert.deepEqual(catalogSortOptionsFor(false), catalogSortOptions);
  assert.deepEqual(catalogSortOptionsFor(false).map((option) => option.value), ["rating", "players", "recent"]);
  assert.deepEqual(catalogSortOptionsFor(true).map((option) => option.value), ["votes", "rating", "players", "recent"]);
  assert.equal(catalogSortOptionsFor(true)[0].label, "Más votados del mes");
});

test("with votes off the catalog sorts exactly as before", () => {
  const off = { votesEnabled: false };
  assert.deepEqual(resolveCatalogSort(undefined, { ...off, hasQuery: false }), { sort: "rating", explicit: false });
  assert.deepEqual(resolveCatalogSort(undefined, { ...off, hasQuery: true }), { sort: "rating", explicit: false });
  assert.deepEqual(resolveCatalogSort("players", { ...off, hasQuery: false }), { sort: "players", explicit: true });
  assert.deepEqual(resolveCatalogSort("rating", { ...off, hasQuery: false }), { sort: "rating", explicit: true });
  assert.deepEqual(resolveCatalogSort("votes", { ...off, hasQuery: false }), { sort: "rating", explicit: false }, "?sort=votes means nothing while votes are off");
  assert.deepEqual(resolveCatalogSort("bogus", { ...off, hasQuery: false }), { sort: "rating", explicit: false });
  assert.equal(defaultCatalogSort(false), "rating");
});

test("with votes on a bare catalog is the ranking, and a search stays relevance unless asked", () => {
  const on = { votesEnabled: true };
  assert.deepEqual(resolveCatalogSort(undefined, { ...on, hasQuery: false }), { sort: "votes", explicit: false });
  assert.deepEqual(resolveCatalogSort(undefined, { ...on, hasQuery: true }), { sort: "rating", explicit: false });
  assert.deepEqual(resolveCatalogSort("votes", { ...on, hasQuery: true }), { sort: "votes", explicit: true });
  assert.deepEqual(resolveCatalogSort("rating", { ...on, hasQuery: false }), { sort: "rating", explicit: true });
  assert.equal(defaultCatalogSort(true), "votes");
});

test("in vote order a row shows its global place, not its index on the page", () => {
  const ranking = { a: { position: 7, votes: 120 }, b: { position: 31, votes: 4 } };
  const opinions = { a: { excerpt: "Genial", rating: 5, authorName: "Kiroo_" } };
  // A filtered page: `b` is second here but 31st in the month.
  assert.deepEqual(catalogRowRanking("a", { byVotes: true, ranking, votes: {}, opinions }), { position: 7, votes: 120, opinion: opinions.a });
  assert.deepEqual(catalogRowRanking("b", { byVotes: true, ranking, votes: {}, opinions }), { position: 31, votes: 4, opinion: null });
});

test("outside vote order a row has votes but no place", () => {
  const ranking = { a: { position: 7, votes: 120 } };
  assert.deepEqual(catalogRowRanking("a", { byVotes: false, ranking, votes: { a: 119 }, opinions: {} }), { position: null, votes: 119, opinion: null });
  assert.deepEqual(catalogRowRanking("z", { byVotes: false, votes: {}, opinions: {} }), { position: null, votes: 0, opinion: null }, "a server nobody voted for has zero");
});
