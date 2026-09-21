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
import type { JevReading } from "./jev";

/** At or above this, the filter is applied without asking. */
export const APPLY_CONFIDENCE = 0.9;
/** At or above this but below {@link APPLY_CONFIDENCE}, the filter is offered as a suggestion. */
export const SUGGEST_CONFIDENCE = 0.5;

export type SearchFilters = {
  modes: string[];
  country?: string;
};

export type SearchSuggestion = {
  kind: "mode" | "country";
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
  const suggested: SearchSuggestion[] = [];

  for (const mode of reading.modes) {
    if (mode.confidence >= apply) appliedModes.add(mode.slug);
    else if (mode.confidence >= suggest) suggested.push({ kind: "mode", value: mode.slug, confidence: mode.confidence });
  }

  const country = reading.country;
  const appliedCountry = country && country.confidence >= apply ? country.code : undefined;
  if (country && appliedCountry === undefined && country.confidence >= suggest) {
    suggested.push({ kind: "country", value: country.code, confidence: country.confidence });
  }

  return {
    applied: {
      // Catalog order and the same cap the query string honours, so the URL this produces is one
      // the catalog could have produced itself.
      modes: gameModes.filter((mode) => appliedModes.has(mode.slug)).map((mode) => mode.slug).slice(0, MAX_SERVER_GAME_MODES),
      country: appliedCountry,
    },
    suggested,
    // A Noul has no confidence of its own: the probability of yes *is* the reading, so the lower
    // band is the only sensible gate here.
    namesServer: reading.nameSearchProbability >= suggest,
  };
}

export function hasFilters(filters: SearchFilters) {
  return filters.modes.length > 0 || filters.country !== undefined;
}
