import { gameModes } from "@/lib/servers/game-modes";

/**
 * The catalog's text search, the part that does not need a database.
 *
 * The rules a visitor can rely on:
 * - every word has to appear somewhere: in the name, the description, an advertised mode or the
 *   address, so "survival españa" narrows instead of matching the whole phrase or nothing;
 * - accents and case never matter: "espana" finds "España" and "ECONOMIA" finds "Economía";
 * - `%` and `_` are plain characters, not wildcards.
 */

/** Longer queries are cut here, and the search box stops accepting text at the same length. */
export const SEARCH_QUERY_MAX_LENGTH = 80;
/** Past this many words a query is a paragraph, and the extra words only add conditions. */
const MAX_SEARCH_TERMS = 8;
/** Below this a word would name half the mode list ("s" is in survival, smp, skyblock…). */
const MIN_MODE_TERM_LENGTH = 3;

const FOLDED_CHARACTERS: ReadonlyArray<readonly [to: string, from: string]> = [
  ["a", "áàäâã"],
  ["e", "éèëê"],
  ["i", "íìïî"],
  ["o", "óòöôõ"],
  ["u", "úùüû"],
  ["n", "ñ"],
  ["c", "ç"],
];

/**
 * The same folding as {@link foldSearchText}, as the two arguments of Postgres' `translate()`.
 * Both cases are listed so the fold never depends on the database's collation knowing how to
 * lowercase an accented capital; `lower()` then only has ASCII left to deal with.
 */
export const SQL_FOLD_FROM = FOLDED_CHARACTERS.map(([, from]) => from + from.toUpperCase()).join("");
export const SQL_FOLD_TO = FOLDED_CHARACTERS.map(([to, from]) => to.repeat(from.length * 2)).join("");

export function foldSearchText(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** A word as a `like` pattern for "contains", with the wildcard characters taken literally. */
export function containsPattern(term: string) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

export function startsWithPattern(term: string) {
  return `${term.replace(/[\\%_]/g, "\\$&")}%`;
}

/** The query as one folded phrase, for ranking: whitespace collapsed, capped at the max length. */
export function catalogSearchPhrase(queryText: string) {
  return foldSearchText(queryText.slice(0, SEARCH_QUERY_MAX_LENGTH)).replace(/\s+/g, " ").trim();
}

/**
 * The words every result has to contain, folded and without duplicates.
 *
 * Quotes and the punctuation people type between words are dropped. Dots, dashes and colons stay,
 * because they are part of addresses; a port pasted after the host is removed, since the catalog
 * stores the two apart and "play.example.com:25565" should still find "play.example.com".
 */
export function catalogSearchTerms(queryText: string) {
  const terms = catalogSearchPhrase(queryText)
    .split(/[\s,;!?¿¡"'«»“”()[\]{}]+/)
    .map((term) => term.replace(/^[.:\-]+|[.:\-]+$/g, "").replace(/^(.+\.[a-z0-9-]+):\d{1,5}$/, "$1"))
    .filter(Boolean);
  return [...new Set(terms)].slice(0, MAX_SEARCH_TERMS);
}

/** The modes a word names, by slug or by label: "economia" and "Economía" both find `economia`. */
export function gameModesMatching(term: string) {
  if (term.length < MIN_MODE_TERM_LENGTH) return [];
  return gameModes.filter((mode) => mode.slug.includes(term) || foldSearchText(mode.label).includes(term)).map((mode) => mode.slug);
}
