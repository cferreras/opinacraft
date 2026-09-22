/**
 * What a confidence is allowed to do.
 *
 * Jev reports how concentrated its answer is, not whether the answer is right, so the number is a
 * gate and nothing more: high enough and the filter is applied, in between and the visitor is
 * offered it as a removable chip, below that and it is dropped. The bands are the ones TypeSafe's
 * confidence guidance starts from — a 0.5 floor for honest uncertainty, 0.9 where acting has a
 * cost — and they are arguments rather than constants so they can be retuned against real queries
 * without touching the pipeline.
 */

import { MAX_SERVER_GAME_MODES, gameModes } from "@/lib/servers/game-modes";
import { regionCountries, serverCountries } from "@/lib/servers/countries";
import { accessIntentValues, catalogAccessValues } from "@/lib/servers/catalog-filters";
import type { JevReading } from "./jev";

/** At or above this, the filter is applied without asking. */
export const APPLY_CONFIDENCE = 0.9;
/** At or above this but below {@link APPLY_CONFIDENCE}, the filter is offered as a suggestion. */
export const SUGGEST_CONFIDENCE = 0.5;

/**
 * The four facets a query can be turned into, each holding what the catalog's own query string
 * holds. Three are plural because one word can name several values — a region is eighteen
 * countries, "no premium" is two kinds of access — and `edition` is single because a visitor asking
 * for Java is excluding Bedrock, not adding to it.
 */
export type SearchFilters = {
  modes: string[];
  countries: string[];
  access: string[];
  edition?: string;
};

/**
 * A group is suggested as itself rather than as the values it covers: offering "Latinoamérica" as
 * eighteen dismissable chips would be a worse answer than not offering it at all. So a `region` or
 * `access` suggestion carries the code the visitor would recognise, and whoever accepts it expands.
 */
export type SearchSuggestionKind = "mode" | "country" | "region" | "access" | "edition";

export type SearchSuggestion = {
  kind: SearchSuggestionKind;
  value: string;
  confidence: number;
};

export type BandedReading = {
  applied: SearchFilters;
  suggested: SearchSuggestion[];
  /** The visitor seems to be naming a server, so the keyword search still has something to do. */
  namesServer: boolean;
};

export type ConfidenceBands = {
  apply?: number;
  suggest?: number;
};

export function bandReading(reading: JevReading, { apply = APPLY_CONFIDENCE, suggest = SUGGEST_CONFIDENCE }: ConfidenceBands = {}): BandedReading {
  const appliedModes = new Set<string>();
  const appliedCountries = new Set<string>();
  const appliedAccess = new Set<string>();
  const suggested: SearchSuggestion[] = [];

  for (const mode of reading.modes) {
    if (mode.confidence >= apply) appliedModes.add(mode.slug);
    else if (mode.confidence >= suggest) suggested.push({ kind: "mode", value: mode.slug, confidence: mode.confidence });
  }

  const { country, region, access, edition } = reading;

  if (country) {
    if (country.confidence >= apply) appliedCountries.add(country.code);
    else if (country.confidence >= suggest) suggested.push({ kind: "country", value: country.code, confidence: country.confidence });
  }
  if (region) {
    if (region.confidence >= apply) for (const code of regionCountries(region.code)) appliedCountries.add(code);
    else if (region.confidence >= suggest) suggested.push({ kind: "region", value: region.code, confidence: region.confidence });
  }

  if (access) {
    if (access.confidence >= apply) for (const value of accessIntentValues(access.intent)) appliedAccess.add(value);
    else if (access.confidence >= suggest) suggested.push({ kind: "access", value: access.intent, confidence: access.confidence });
  }

  let appliedEdition: string | undefined;
  if (edition) {
    if (edition.confidence >= apply) appliedEdition = edition.value;
    else if (edition.confidence >= suggest) suggested.push({ kind: "edition", value: edition.value, confidence: edition.confidence });
  }

  return {
    applied: {
      // Catalog order throughout, and the same cap the query string honours, so the URL this
      // produces is one the catalog could have produced itself.
      modes: gameModes.filter((mode) => appliedModes.has(mode.slug)).map((mode) => mode.slug).slice(0, MAX_SERVER_GAME_MODES),
      countries: serverCountries.filter((country) => appliedCountries.has(country.code)).map((country) => country.code),
      access: catalogAccessValues.filter((value) => appliedAccess.has(value)),
      ...(appliedEdition ? { edition: appliedEdition } : {}),
    },
    suggested,
    // A Noul has no confidence of its own: the probability of yes *is* the reading, so the lower
    // band is the only sensible gate here.
    namesServer: reading.nameSearchProbability >= suggest,
  };
}

export function hasFilters(filters: SearchFilters) {
  return filters.modes.length > 0 || filters.countries.length > 0 || filters.access.length > 0 || filters.edition !== undefined;
}
