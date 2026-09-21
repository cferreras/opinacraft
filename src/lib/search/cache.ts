/**
 * Remembering what a query meant, so the same phrase is never paid for twice.
 *
 * The key is a hash of the *normalized* query, which is what makes the cache worth having: "En
 * España, survival!" and "espana survival" are one entry. Only readings that came from Jev are
 * stored — the dictionary is already free, and a keyword fallback is not an interpretation.
 *
 * Entries are rewritten rather than expired in place, so a stale row is harmless: freshness is
 * decided on read against the configured TTL.
 */

import { createHash } from "node:crypto";

import type { SearchFilters, SearchSuggestion } from "./bands";

export type CachedInterpretation = {
  filters: SearchFilters;
  suggested: SearchSuggestion[];
  namesServer: boolean;
  /** The model that produced it, so a model change can be told apart from a tuning change. */
  model: string;
};

export type SearchCacheEntry = {
  interpretation: CachedInterpretation;
  storedAt: Date;
};

export type SearchCacheStore = {
  read: (hash: string) => Promise<SearchCacheEntry | null>;
  write: (hash: string, query: string, interpretation: CachedInterpretation) => Promise<void>;
};

export function searchCacheKey(normalizedQuery: string) {
  return createHash("sha256").update(normalizedQuery, "utf8").digest("hex");
}

export function isFreshEntry(entry: SearchCacheEntry, { ttlHours, now = new Date() }: { ttlHours: number; now?: Date }) {
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) return false;
  const age = now.getTime() - entry.storedAt.getTime();
  // A row dated in the future means a clock moved, not a fresh entry.
  return age >= 0 && age <= ttlHours * 60 * 60 * 1000;
}

/** A cache that remembers nothing, for the paths and the tests that should not depend on one. */
export const noSearchCache: SearchCacheStore = {
  read: async () => null,
  write: async () => {},
};
