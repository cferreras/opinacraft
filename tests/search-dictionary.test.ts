import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SEARCH_QUERY_LENGTH, normalizeSearchQuery, searchQueryTokens } from "@/lib/search/normalize";
import { isFullyResolved, resolveFromDictionary } from "@/lib/search/dictionary";
import { gameModes, isGameModeSlug } from "@/lib/servers/game-modes";
import { isServerCountryCode } from "@/lib/servers/countries";
import { isCatalogAccessFilter, isCatalogEdition } from "@/lib/servers/catalog-filters";

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
  assert.deepEqual(resolveFromDictionary("españa").countries, ["es"]);
  assert.deepEqual(resolveFromDictionary("spain").countries, ["es"]);
  assert.deepEqual(resolveFromDictionary("es").countries, ["es"]);
  assert.deepEqual(resolveFromDictionary("mexicano").countries, ["mx"]);
  assert.deepEqual(resolveFromDictionary("costa rica").countries, ["cr"]);
  assert.deepEqual(resolveFromDictionary("rep. dominicana").countries, ["do"]);
  assert.deepEqual(resolveFromDictionary("internacional").countries, ["global"]);
});

test("a bare two-letter code is a country only when something introduces it as one", () => {
  // The spec asks for "es" to mean Spain, but "es" is also a verb: the surrounding words decide.
  assert.deepEqual(resolveFromDictionary("servidores en es").countries, ["es"]);
  assert.deepEqual(resolveFromDictionary("servidores de es").countries, ["es"]);
  assert.deepEqual(resolveFromDictionary("es").countries, ["es"]);
  assert.deepEqual(resolveFromDictionary("survival es").countries, ["es"]);

  const misreading = resolveFromDictionary("cual es el mejor servidor de survival");
  assert.deepEqual(misreading.countries, [], "a verb must not become a country filter");
  assert.deepEqual(misreading.modes, ["survival"]);
  assert.deepEqual(misreading.unresolved, [], "the leftover verb must not pay for a Jev call");
});

test("a fully understood query needs no inference", () => {
  const resolution = resolveFromDictionary("quiero un servidor de survival en españa");
  assert.deepEqual(resolution.modes, ["survival"]);
  assert.deepEqual(resolution.countries, ["es"]);
  assert.deepEqual(resolution.unresolved, []);
  assert.equal(isFullyResolved(resolution), true);
});

test("an unanswered term is what sends the query to Jev", () => {
  const resolution = resolveFromDictionary("servidores sin lag y con staff activo");
  assert.deepEqual(resolution.modes, []);
  assert.deepEqual(resolution.countries, []);
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

test("two countries both stand, because the facet they land in repeats", () => {
  // This used to keep Spain and hand Mexico to Jev, because `?country=` held one value. Now it is
  // read as "any of these", so the query is fully answered and costs nothing.
  const resolution = resolveFromDictionary("servidores de españa y mexico");
  assert.deepEqual(resolution.countries, ["es", "mx"]);
  assert.deepEqual(resolution.unresolved, []);
  assert.equal(isFullyResolved(resolution), true);
});

test("a pasted address resolves to nothing and stays a keyword search", () => {
  const resolution = resolveFromDictionary("mc.example.net");
  assert.deepEqual(resolution.modes, []);
  assert.deepEqual(resolution.countries, []);
  assert.deepEqual(resolution.unresolved, ["mc.example.net"]);
});

test("the two facets a Minecraft player asks for first resolve without inference", () => {
  // Both were reported as finding nothing at all: the catalog has filtered by access and edition
  // since long before the search box could say either word.
  assert.deepEqual(resolveFromDictionary("premium").access, ["premium"]);
  assert.equal(resolveFromDictionary("java").edition, "java");
  assert.equal(resolveFromDictionary("bedrock").edition, "bedrock");
  assert.equal(resolveFromDictionary("servidores para movil").edition, "bedrock");

  for (const query of ["premium", "java", "bedrock"]) {
    assert.equal(isFullyResolved(resolveFromDictionary(query)), true, `${query} must not cost a Jev call`);
  }
});

test("\"no premium\" keeps both kinds of server that accept an unlicensed account", () => {
  // `non-premium` and `semi-premium` differ only in whether premium players type a password, so
  // answering with either one alone would hide servers that do exactly what was asked.
  assert.deepEqual(resolveFromDictionary("no premium").access, ["non-premium", "semi-premium"]);
  assert.deepEqual(resolveFromDictionary("servidores pirata").access, ["non-premium", "semi-premium"]);
  assert.deepEqual(resolveFromDictionary("sin licencia").access, ["non-premium", "semi-premium"]);

  // The longer phrase wins over the "premium" inside it, or the filter would be the opposite one.
  assert.deepEqual(resolveFromDictionary("no premium").access, resolveFromDictionary("nopremium").access);
  assert.notDeepEqual(resolveFromDictionary("no premium").access, resolveFromDictionary("premium").access);
});

test("a word that names a region resolves to the countries it covers", () => {
  const latino = resolveFromDictionary("servidores latinos");

  assert.ok(latino.countries.includes("mx") && latino.countries.includes("ar") && latino.countries.includes("cl"));
  assert.equal(latino.countries.includes("es"), false, "Latin America is not Spain");
  assert.equal(latino.countries.includes("global"), false, "and it is not \"international\" either");
  assert.equal(isFullyResolved(latino), true);

  assert.deepEqual(resolveFromDictionary("latam").countries, latino.countries);
  assert.deepEqual(resolveFromDictionary("sudamerica").countries, latino.countries);
});

test("an adjective that is not a filter is still left for Jev", () => {
  // The line between the two tables: "premium" is a facet, "original" is an opinion. Reading the
  // second as the first would have filtered "algo diferente y original" down to licensed accounts.
  for (const word of ["original", "gratis", "activo", "pros"]) {
    const resolution = resolveFromDictionary(word);
    assert.deepEqual(resolution.access, [], `${word} must not become an access filter`);
    assert.equal(resolution.edition, undefined);
    assert.deepEqual(resolution.unresolved, [word]);
  }
});

test("the words for a dungeon boss reach the mode whose description promises them", () => {
  for (const word of ["bosses", "jefes", "mazmorras", "dungeons"]) {
    assert.deepEqual(resolveFromDictionary(word).modes, ["mmorpg"], word);
  }
});

test("a country code that is also a platform abbreviation stays the country", () => {
  // "pe" is what MCPE is short for and also Peru. The country wins, so a named country cannot turn
  // into a platform filter behind the visitor's back.
  assert.deepEqual(resolveFromDictionary("servidores de pe").countries, ["pe"]);
  assert.equal(resolveFromDictionary("servidores de pe").edition, undefined);
  assert.equal(resolveFromDictionary("mcpe").edition, "bedrock");
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
    for (const code of resolution.countries) assert.equal(isServerCountryCode(code), true, `${phrase} produced the unknown country ${code}`);
    for (const value of resolution.access) assert.equal(isCatalogAccessFilter(value), true, `${phrase} produced the unknown access ${value}`);
    if (resolution.edition !== undefined) assert.equal(isCatalogEdition(resolution.edition), true, `${phrase} produced the unknown edition ${resolution.edition}`);
  }
});
