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
 *
 * There is a third answer this module can report but never acts on: some queries ask for something
 * no facet can express ("pocos miembros", "de chill"), and for those the honest reply is that the
 * cheap answer is incomplete. It says so with {@link SearchInterpretation.needsSemantic} and leaves
 * the spending decision to the caller, which is the only place that knows whether the visitor
 * pressed Enter, whether there is budget, and what a per-server judgement would cost today.
 */

import { isFullyResolved, resolveFromDictionary } from "./dictionary";
import { normalizeSearchQuery } from "./normalize";
import { bandReading, hasFilters, type ConfidenceBands, type SearchFilters, type SearchSuggestion } from "./bands";
import { isFreshEntry, noSearchCache, searchCacheKey, type CachedInterpretation, type SearchCacheStore } from "./cache";
import type { JevAsk } from "./jev";
import { MAX_SERVER_GAME_MODES, gameModes } from "@/lib/servers/game-modes";
import { serverCountries } from "@/lib/servers/countries";
import { catalogAccessValues } from "@/lib/servers/catalog-filters";

/**
 * At or above this, the query is reported as needing per-server judgement. High on purpose and
 * biased toward the cheap road: this is a model deciding to spend twenty requests instead of none,
 * so it should only do so when the query plainly asks for something no facet can express.
 */
export const SEMANTIC_ROUTE_THRESHOLD = 0.7;

/** Where the answer came from. Reported back so the route can log it and the UI can explain it. */
export type SearchInterpretationSource = "empty" | "dictionary" | "cache" | "jev" | "keyword";

export type SearchInterpretation = {
  source: SearchInterpretationSource;
  filters: SearchFilters;
  suggested: SearchSuggestion[];
  /** What belongs in `?q=`: the visitor's own text, or nothing when the filters replace it. */
  keyword: string;
  normalizedQuery: string;
  /**
   * The query asks for something the facets cannot express, so this answer is incomplete on its
   * own. The caller decides whether to pay for a per-server judgement.
   */
  needsSemantic: boolean;
  /**
   * The subset of the filters that came from a literal dictionary match rather than from
   * inference. Exact, so it can narrow a semantic search without guessing: "en latam" is a word
   * the visitor wrote, and a Spanish server does not satisfy it however well it scores. Inferred
   * facets are not safe that way, which is why they are not in here.
   */
  exactFilters: SearchFilters;
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
  semanticThreshold?: number;
};

const emptyFilters: SearchFilters = { modes: [], countries: [], access: [] };

type Outcome = {
  exact: SearchFilters;
  needsSemantic: boolean;
};

function keywordOnly(query: string, normalizedQuery: string, source: SearchInterpretationSource, { exact, needsSemantic }: Outcome, suggested: SearchSuggestion[] = []): SearchInterpretation {
  return { source, filters: emptyFilters, suggested, keyword: query.trim(), normalizedQuery, needsSemantic, exactFilters: exact };
}

/**
 * The answer when Jev is not going to contribute — no budget, no session, no key, or a call that
 * failed. Whatever the dictionary already resolved still stands.
 *
 * Throwing it away was the worst of both worlds: "survival para pros" searched for the whole phrase
 * as one string and found nothing, while "survival" on its own filters correctly. The word we could
 * not place is dropped rather than searched for, which is the trade the rest of the pipeline already
 * makes — we filter by what we understood instead of grepping for what we did not.
 *
 * `needsSemantic` is false here whatever the query asked for: with no reading there is no judgement
 * saying it needs one, and guessing "probably yes" would spend twenty requests on the strength of
 * a failed call.
 */
function withoutInference(query: string, normalizedQuery: string, exact: SearchFilters): SearchInterpretation {
  const outcome: Outcome = { exact, needsSemantic: false };
  if (!hasFilters(exact)) return keywordOnly(query, normalizedQuery, "keyword", outcome);
  return { source: "dictionary", filters: exact, suggested: [], keyword: "", normalizedQuery, needsSemantic: false, exactFilters: exact };
}

/**
 * The dictionary is exact and Jev is not, so where both have an opinion the dictionary keeps it.
 *
 * Modes are the exception, and a union: a query really can name two ways of playing, and the
 * dictionary catching one of them says nothing about the other. Place and access are not like that.
 * There the dictionary matched a word the visitor actually wrote, while Jev is guessing about those
 * same words — so a confident-but-wrong "mx" must not widen a query that already said "españa".
 * Two countries both stand when the dictionary itself read both; that is its own decision to make.
 */
function mergeFilters(exact: SearchFilters, inferred: SearchFilters): SearchFilters {
  const slugs = new Set([...exact.modes, ...inferred.modes]);
  const countries = exact.countries.length > 0 ? exact.countries : inferred.countries;
  const access = exact.access.length > 0 ? exact.access : inferred.access;
  const edition = exact.edition ?? inferred.edition;

  return {
    modes: gameModes.filter((mode) => slugs.has(mode.slug)).map((mode) => mode.slug).slice(0, MAX_SERVER_GAME_MODES),
    countries: serverCountries.filter((country) => countries.includes(country.code)).map((country) => country.code),
    access: catalogAccessValues.filter((value) => access.includes(value)),
    ...(edition ? { edition } : {}),
  };
}

function asSuggestions(filters: SearchFilters, confidence: number): SearchSuggestion[] {
  return [
    ...filters.modes.map((value) => ({ kind: "mode" as const, value, confidence })),
    ...filters.countries.map((value) => ({ kind: "country" as const, value, confidence })),
    ...filters.access.map((value) => ({ kind: "access" as const, value, confidence })),
    ...(filters.edition ? [{ kind: "edition" as const, value: filters.edition, confidence }] : []),
  ];
}

/**
 * Turns a cached or fresh reading into the final answer.
 *
 * When Jev reports that the query names a specific server, the keyword search is what the visitor
 * actually wants — so it runs, and everything we inferred is offered as a chip instead of being
 * imposed. Keeping that decision here rather than in the cache means it can be retuned without
 * re-inferring anything.
 *
 * Naming a server also settles the routing question: "hypixel" is a lookup, not a description, so
 * it never needs every server read individually however the router answered.
 */
function applyPolicy(query: string, normalizedQuery: string, exact: SearchFilters, reading: CachedInterpretation, source: SearchInterpretationSource, semanticThreshold: number): SearchInterpretation {
  const filters = mergeFilters(exact, reading.filters);
  const needsSemantic = !reading.namesServer && reading.needsSemantic >= semanticThreshold;
  const outcome: Outcome = { exact, needsSemantic };

  if (!hasFilters(filters)) return keywordOnly(query, normalizedQuery, "keyword", outcome, reading.suggested);
  if (reading.namesServer) {
    return keywordOnly(query, normalizedQuery, "keyword", { exact, needsSemantic: false }, [...asSuggestions(filters, 1), ...reading.suggested]);
  }

  return { source, filters, suggested: reading.suggested, keyword: "", normalizedQuery, needsSemantic, exactFilters: exact };
}

export async function interpretSearchQuery(query: string, deps: InterpretDeps): Promise<SearchInterpretation> {
  const { ask, cache = noSearchCache, allowInference, bands, ttlHours = 72, now = () => new Date(), semanticThreshold = SEMANTIC_ROUTE_THRESHOLD } = deps;
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return { source: "empty", filters: emptyFilters, suggested: [], keyword: "", normalizedQuery, needsSemantic: false, exactFilters: emptyFilters };
  }

  const dictionary = resolveFromDictionary(normalizedQuery);
  // Spread rather than `edition: dictionary.edition`, so an unresolved edition leaves no key at
  // all: every filters object the pipeline hands out then has one shape, whichever branch built it.
  const exact: SearchFilters = {
    modes: dictionary.modes,
    countries: dictionary.countries,
    access: dictionary.access,
    ...(dictionary.edition ? { edition: dictionary.edition } : {}),
  };

  // Nothing left to interpret: the whole query is already a filter. A certainty that costs nothing
  // beats a judgement that costs a request, so the router is never asked about these.
  if (isFullyResolved(dictionary)) {
    return { source: "dictionary", filters: exact, suggested: [], keyword: "", normalizedQuery, needsSemantic: false, exactFilters: exact };
  }

  const hash = searchCacheKey(normalizedQuery);
  const cached = await cache.read(hash);
  if (cached && isFreshEntry(cached, { ttlHours, now: now() })) {
    return applyPolicy(query, normalizedQuery, exact, cached.interpretation, "cache", semanticThreshold);
  }

  if (allowInference && !(await allowInference())) {
    return withoutInference(query, normalizedQuery, exact);
  }

  const reading = await ask(normalizedQuery);
  if (!reading) return withoutInference(query, normalizedQuery, exact);

  const banded = bandReading(reading, bands);
  const interpretation: CachedInterpretation = {
    filters: banded.applied,
    suggested: banded.suggested,
    namesServer: banded.namesServer,
    // Stored raw rather than as a decision, so the routing threshold can be retuned against real
    // queries without re-asking anything — the same reason the bands live outside the cache.
    needsSemantic: reading.needsSemanticProbability,
    model: reading.model,
  };
  // Written even when it resolved to nothing: a query Jev could not turn into a filter is exactly
  // the one not worth asking about again today.
  await cache.write(hash, normalizedQuery, interpretation);

  return applyPolicy(query, normalizedQuery, exact, interpretation, "jev", semanticThreshold);
}
