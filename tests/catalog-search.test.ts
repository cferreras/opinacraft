import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SEARCH_QUERY_MAX_LENGTH,
  SQL_FOLD_FROM,
  SQL_FOLD_TO,
  catalogSearchPhrase,
  catalogSearchTerms,
  containsPattern,
  foldSearchText,
  gameModesMatching,
  startsWithPattern,
} from "@/lib/servers/catalog-search";

const readProjectFile = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");

test("ignores accents and case, the way people actually type", () => {
  assert.equal(foldSearchText("España"), "espana");
  assert.equal(foldSearchText("ECONOMÍA"), "economia");
  assert.equal(foldSearchText("Pingüino"), "pinguino");
});

test("folds in Postgres exactly what it folds in JavaScript", () => {
  assert.equal(SQL_FOLD_FROM.length, SQL_FOLD_TO.length, "translate() maps character by character");
  for (const [index, character] of [...SQL_FOLD_FROM].entries()) {
    assert.equal(foldSearchText(character), SQL_FOLD_TO[index]!.toLowerCase(), `${character} folds the same on both sides`);
  }
});

test("splits a query into the words every result must contain", () => {
  assert.deepEqual(catalogSearchTerms("  Survival   España "), ["survival", "espana"]);
  assert.deepEqual(catalogSearchTerms("«survival», ¿españa?"), ["survival", "espana"]);
  assert.deepEqual(catalogSearchTerms("pvp PvP pvp"), ["pvp"], "repeated words add nothing");
  assert.deepEqual(catalogSearchTerms("!!! ..."), []);
  assert.deepEqual(catalogSearchTerms(""), []);
});

test("keeps addresses whole and drops a pasted port", () => {
  assert.deepEqual(catalogSearchTerms("play.example.com"), ["play.example.com"]);
  assert.deepEqual(catalogSearchTerms("play.example.com:25565"), ["play.example.com"]);
  assert.deepEqual(catalogSearchTerms("123.45.67.89:19132"), ["123.45.67.89"]);
  assert.deepEqual(catalogSearchTerms("mc-red.es."), ["mc-red.es"], "a sentence's full stop is not part of the host");
});

test("caps how much of a query reaches the database", () => {
  const long = "survival ".repeat(40);
  assert.ok(catalogSearchPhrase(long).length <= SEARCH_QUERY_MAX_LENGTH);
  assert.ok(catalogSearchTerms("a b c d e f g h i j k l").length <= 8);
});

test("treats LIKE wildcards in the query as plain characters", () => {
  assert.equal(containsPattern("100%"), "%100\\%%");
  assert.equal(containsPattern("mi_server"), "%mi\\_server%");
  assert.equal(containsPattern("a\\b"), "%a\\\\b%");
  assert.equal(startsWithPattern("50%"), "50\\%%");
});

test("finds modes by slug or by label, but not from a fragment too short to mean one", () => {
  assert.deepEqual(gameModesMatching("economia"), ["economia"]);
  assert.deepEqual(gameModesMatching("tecnico"), ["tecnico"]);
  assert.ok(gameModesMatching("pvp").includes("pvp"));
  assert.ok(gameModesMatching("pvp").includes("kitpvp"));
  assert.deepEqual(gameModesMatching("murder"), ["murder"]);
  assert.deepEqual(gameModesMatching("mystery"), ["murder"], "the label counts, not only the slug");
  assert.deepEqual(gameModesMatching("sm"), []);
});

test("searches word by word across name, description, modes and addresses", () => {
  const source = readProjectFile("src/lib/servers/queries.ts");

  assert.match(source, /const terms = catalogSearchTerms\(queryText\);/);
  assert.match(source, /return and\(\.\.\.terms\.map\(\(term\) => \{/, "every word has to match");
  assert.match(source, /lower\(se\.host\) like \$\{pattern\}/, "the address is searchable");
  assert.match(source, /word_similarity\(\$\{term\}, \$\{name\}\)/, "the name forgives typos");
  assert.doesNotMatch(source, /ilike\(servers\.name, `%\$\{needle\}%`\)/, "raw input never becomes a LIKE pattern");
});

test("the catalog no longer carries the AI search", () => {
  const page = readProjectFile("src/app/servers/page.tsx");
  const bar = readProjectFile("src/components/catalog-filter-bar.tsx");
  const box = readProjectFile("src/components/server-search-box.tsx");

  assert.doesNotMatch(page, /query\.relevancia|relevancia: undefined|runSemanticSearch|AiRankingNotice/);
  assert.doesNotMatch(page, /turnstile/i);
  assert.doesNotMatch(bar, /AiSearchBox|turnstile/i);
  assert.doesNotMatch(box, /\/api\/search|turnstile|interpret/i);
  assert.match(box, /name="q"/, "the box stays a plain GET field");
});
