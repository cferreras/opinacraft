/**
 * The text the search pipeline reasons about, as opposed to the text the visitor typed.
 *
 * Case, accents and punctuation carry no filter meaning here — "España", "espana" and "ESPAÑA!"
 * are the same request — so they are folded away before the dictionary, the cache key or Jev see
 * the query. The visitor's original string survives untouched in `?q=`, because the keyword
 * search still needs it to match a server actually called "Ñandú".
 */

/** The same cut `catalogSearchCondition` already applies before a query reaches SQL. */
export const MAX_SEARCH_QUERY_LENGTH = 80;

/** Dots and colons survive the fold so a pasted address stays one token instead of four. */
const NON_QUERY_CHARACTERS = /[^a-z0-9.:]+/g;
const COMBINING_MARKS = /[̀-ͯ]/g;
const TOKEN_EDGE_PUNCTUATION = /^[.:]+|[.:]+$/g;

export function normalizeSearchQuery(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NON_QUERY_CHARACTERS, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_SEARCH_QUERY_LENGTH)
    .trim();
}

/**
 * Words to match the dictionary against. Edge punctuation goes because "survival." and "survival"
 * are the same word, while an inner dot stays because "mc.example.net" is not three words.
 */
export function searchQueryTokens(normalized: string): string[] {
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.replace(TOKEN_EDGE_PUNCTUATION, ""))
    .filter((token) => token.length > 0);
}
