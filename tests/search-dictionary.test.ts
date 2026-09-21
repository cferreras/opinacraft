import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SEARCH_QUERY_LENGTH, normalizeSearchQuery, searchQueryTokens } from "@/lib/search/normalize";
import { isFullyResolved, resolveFromDictionary } from "@/lib/search/dictionary";
import { gameModes, isGameModeSlug } from "@/lib/servers/game-modes";
import { isServerCountryCode } from "@/lib/servers/countries";

test("the normalizer folds case, accents and punctuation into one comparable form", () => {
  assert.equal(normalizeSearchQuery("ESPAÑA"), "espana");
  assert.equal(normalizeSearchQuery("  Técnico   y   Economía!  "), "tecnico y economia");
  assert.equal(normalizeSearchQuery("¿Servidores de Perú?"), "servidores de peru");
  assert.equal(normalizeSearchQuery("survival\tespaña\n"), "survival espana");
  assert.equal(normalizeSearchQuery(""), "");
});

test("the normalizer keeps a pasted address in one piece and caps the query", () => {
  assert.equal(normalizeSearchQuery("mc.EXAMPLE.net:25565"), "mc.example.net:25565");
  assert.deepEqual(searchQueryTokens(normalizeSearchQuery("mc.example.net:25565")), ["mc.example.net:25565"]);
  // Trailing punctuation is not part of the word, an inner dot is.
  assert.deepEqual(searchQueryTokens(normalizeSearchQuery("survival, pvp.")), ["survival", "pvp"]);
  assert.equal(normalizeSearchQuery("a".repeat(200)).length, MAX_SEARCH_QUERY_LENGTH);
});

test("the dictionary resolves mode synonyms in Spanish and English to catalog slugs", () => {
  assert.deepEqual(resolveFromDictionary("tecnico").modes, ["tecnico"]);
  assert.deepEqual(resolveFromDictionary("technical").modes, ["tecnico"]);
  assert.deepEqual(resolveFromDictionary("redstone").modes, ["tecnico"]);
  assert.deepEqual(resolveFromDictionary("supervivencia").modes, ["survival"]);
  assert.deepEqual(resolveFromDictionary("Técnico").modes, ["tecnico"]);
  // Multi-word aliases beat the single words they contain.
  assert.deepEqual(resolveFromDictionary("murder mystery").modes, ["murder"]);
  assert.deepEqual(resolveFromDictionary("one block").modes, ["oneblock"]);
});

test("the dictionary resolves country synonyms to catalog codes", () => {
  assert.equal(resolveFromDictionary("españa").country, "es");
  assert.equal(resolveFromDictionary("spain").country, "es");
  assert.equal(resolveFromDictionary("es").country, "es");
  assert.equal(resolveFromDictionary("mexicano").country, "mx");
  assert.equal(resolveFromDictionary("costa rica").country, "cr");
  assert.equal(resolveFromDictionary("rep. dominicana").country, "do");
  assert.equal(resolveFromDictionary("internacional").country, "global");
});

test("a bare two-letter code is a country only when something introduces it as one", () => {
  // The spec asks for "es" to mean Spain, but "es" is also a verb: the surrounding words decide.
  assert.equal(resolveFromDictionary("servidores en es").country, "es");
  assert.equal(resolveFromDictionary("servidores de es").country, "es");
  assert.equal(resolveFromDictionary("es").country, "es");
  assert.equal(resolveFromDictionary("survival es").country, "es");

  const misreading = resolveFromDictionary("cual es el mejor servidor de survival");
  assert.equal(misreading.country, undefined, "a verb must not become a country filter");
  assert.deepEqual(misreading.modes, ["survival"]);
  assert.deepEqual(misreading.unresolved, [], "the leftover verb must not pay for a Jev call");
});

test("a fully understood query needs no inference", () => {
  const resolution = resolveFromDictionary("quiero un servidor de survival en españa");
  assert.deepEqual(resolution.modes, ["survival"]);
  assert.equal(resolution.country, "es");
  assert.deepEqual(resolution.unresolved, []);
  assert.equal(isFullyResolved(resolution), true);
});

test("an unanswered term is what sends the query to Jev", () => {
  const resolution = resolveFromDictionary("servidores sin lag y con staff activo");
  assert.deepEqual(resolution.modes, []);
  assert.equal(resolution.country, undefined);
  assert.deepEqual(resolution.unresolved, ["sin", "lag", "staff", "activo"]);
  assert.equal(isFullyResolved(resolution), false);
});

test("stop words alone resolve nothing, so there is nothing to filter and nothing to infer", () => {
  const resolution = resolveFromDictionary("los mejores servidores de minecraft");
  assert.deepEqual(resolution.modes, []);
  assert.deepEqual(resolution.unresolved, []);
  assert.equal(isFullyResolved(resolution), false, "an empty result is not a resolved filter");
});

test("several modes come back deduplicated, in catalog order and capped at what a server may hold", () => {
  const resolution = resolveFromDictionary("economia survival y supervivencia");
  assert.deepEqual(resolution.modes, ["survival", "economia"], "catalog order, not query order");

  const capped = resolveFromDictionary("survival smp skyblock creativo pvp");
  assert.equal(capped.modes.length, 3);
  assert.deepEqual(capped.modes, ["survival", "smp", "skyblock"]);
});

test("a second country is left for Jev instead of being dropped silently", () => {
  const resolution = resolveFromDictionary("servidores de españa y mexico");
  assert.equal(resolution.country, "es");
  assert.deepEqual(resolution.unresolved, ["mexico"]);
  assert.equal(isFullyResolved(resolution), false);
});

test("a pasted address resolves to nothing and stays a keyword search", () => {
  const resolution = resolveFromDictionary("mc.example.net");
  assert.deepEqual(resolution.modes, []);
  assert.equal(resolution.country, undefined);
  assert.deepEqual(resolution.unresolved, ["mc.example.net"]);
});

test("every mode in the catalog is reachable by its own slug and label", () => {
  for (const mode of gameModes) {
    assert.deepEqual(resolveFromDictionary(mode.slug).modes, [mode.slug], `slug ${mode.slug}`);
    assert.deepEqual(resolveFromDictionary(mode.label).modes, [mode.slug], `label ${mode.label}`);
  }
});

test("the dictionary can only ever produce values the catalogs already know", () => {
  const phrases = [
    ...gameModes.map((mode) => mode.label),
    "spain", "mexicano", "costa rica", "rep dominicana", "eeuu", "worldwide",
    "redstone", "bed wars", "kit pvp", "ultra hardcore", "pokemon", "boricua",
  ];

  for (const phrase of phrases) {
    const resolution = resolveFromDictionary(phrase);
    for (const mode of resolution.modes) assert.equal(isGameModeSlug(mode), true, `${phrase} produced the unknown mode ${mode}`);
    if (resolution.country !== undefined) assert.equal(isServerCountryCode(resolution.country), true, `${phrase} produced the unknown country ${resolution.country}`);
  }
});
