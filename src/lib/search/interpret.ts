/**
 * The search pipeline, in the order the steps are allowed to spend money.
 *
 *   normalize → dictionary → cache → daily budget → Jev → filters
 *
 * Every step can end the pipeline, and the last resort is always the keyword search the catalog
 * has always had. Nothing in here throws: an unavailable Jev, an exhausted budget, an unreadable
 * cache and an unintelligible query all land on the same fallback, because a visitor typing in a
 * search box should never be shown an error about inference.
 *
 * Filters and keywords are deliberately exclusive. The existing keyword condition matches the
 * whole query as one phrase against a name or description, so combining it with a mode filter
 * would intersect two narrow sets and usually return nothing. So: if we understood the query,
 * we filter by what we understood; if we did not, we search for what was typed.
 */

import { isFullyResolved, resolveFromDictionary } from "./dictionary";
import { normalizeSearchQuery } from "./normalize";
import { bandReading, hasFilters, type ConfidenceBands, type SearchFilters, type SearchSuggestion } from "./bands";
import { isFreshEntry, noSearchCache, searchCacheKey, type CachedInterpretation, type SearchCacheStore } from "./cache";
import type { JevAsk } from "./jev";
import { MAX_SERVER_GAME_MODES, gameModes } from "@/lib/servers/game-modes";

/** Where the answer came from. Reported back so the route can log it and the UI can explain it. */
export type SearchInterpretationSource = "empty" | "dictionary" | "cache" | "jev" | "keyword";

export type SearchInterpretation = {
  source: SearchInterpretationSource;
  filters: SearchFilters;
  suggested: SearchSuggestion[];
  /** What belongs in `?q=`: the visitor's own text, or nothing when the filters replace it. */
  keyword: string;
  normalizedQuery: string;
};

export type InterpretDeps = {
  ask: JevAsk;
  cache?: SearchCacheStore;
  /**
   * The gate in front of Jev: the daily ceiling, and whatever else the caller requires (a valid
   * Turnstile session, the feature being enabled at all). False means "do not call Jev now".
   */
  allowInference?: () => Promise<boolean>;
  bands?: ConfidenceBands;
  ttlHours?: number;
  now?: () => Date;
};

const emptyFilters: SearchFilters = { modes: [] };

function keywordOnly(query: string, normalizedQuery: string, source: SearchInterpretationSource, suggested: SearchSuggestion[] = []): SearchInterpretation {
  return { source, filters: emptyFilters, suggested, keyword: query.trim(), normalizedQuery };
}

/**
 * The dictionary is exact and Jev is not, so where both have an opinion the dictionary keeps it.
 * Modes are a union because they are read as "any of these", and the cap is the catalog's own.
 */
function mergeFilters(exact: SearchFilters, inferred: SearchFilters): SearchFilters {
  const slugs = new Set([...exact.modes, ...inferred.modes]);
  return {
    modes: gameModes.filter((mode) => slugs.has(mode.slug)).map((mode) => mode.slug).slice(0, MAX_SERVER_GAME_MODES),
    country: exact.country ?? inferred.country,
  };
}

function asSuggestions(filters: SearchFilters, confidence: number): SearchSuggestion[] {
  return [
    ...filters.modes.map((value) => ({ kind: "mode" as const, value, confidence })),
    ...(filters.country ? [{ kind: "country" as const, value: filters.country, confidence }] : []),
  ];
}

/**
 * Turns a cached or fresh reading into the final answer.
 *
 * When Jev reports that the query names a specific server, the keyword search is what the visitor
 * actually wants — so it runs, and everything we inferred is offered as a chip instead of being
 * imposed. Keeping that decision here rather than in the cache means it can be retuned without
 * re-inferring anything.
 */
function applyPolicy(query: string, normalizedQuery: string, exact: SearchFilters, reading: CachedInterpretation, source: SearchInterpretationSource): SearchInterpretation {
  const filters = mergeFilters(exact, reading.filters);

  if (!hasFilters(filters)) return keywordOnly(query, normalizedQuery, "keyword", reading.suggested);
  if (reading.namesServer) {
    return keywordOnly(query, normalizedQuery, "keyword", [...asSuggestions(filters, 1), ...reading.suggested]);
  }

  return { source, filters, suggested: reading.suggested, keyword: "", normalizedQuery };
}

export async function interpretSearchQuery(query: string, deps: InterpretDeps): Promise<SearchInterpretation> {
  const { ask, cache = noSearchCache, allowInference, bands, ttlHours = 72, now = () => new Date() } = deps;
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return { source: "empty", filters: emptyFilters, suggested: [], keyword: "", normalizedQuery };

  const dictionary = resolveFromDictionary(normalizedQuery);
  const exact: SearchFilters = { modes: dictionary.modes, country: dictionary.country };

  // Nothing left to interpret: the whole query is already a filter.
  if (isFullyResolved(dictionary)) {
    return { source: "dictionary", filters: exact, suggested: [], keyword: "", normalizedQuery };
  }

  const hash = searchCacheKey(normalizedQuery);
  const cached = await cache.read(hash);
  if (cached && isFreshEntry(cached, { ttlHours, now: now() })) {
    return applyPolicy(query, normalizedQuery, exact, cached.interpretation, "cache");
  }

  if (allowInference && !(await allowInference())) {
    return keywordOnly(query, normalizedQuery, "keyword");
  }

  const reading = await ask(normalizedQuery);
  if (!reading) return keywordOnly(query, normalizedQuery, "keyword");

  const banded = bandReading(reading, bands);
  const interpretation: CachedInterpretation = {
    filters: banded.applied,
    suggested: banded.suggested,
    namesServer: banded.namesServer,
    model: reading.model,
  };
  // Written even when it resolved to nothing: a query Jev could not turn into a filter is exactly
  // the one not worth asking about again today.
  await cache.write(hash, normalizedQuery, interpretation);

  return applyPolicy(query, normalizedQuery, exact, interpretation, "jev");
}
