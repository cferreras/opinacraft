/**
 * The Postgres side of the interpretation cache.
 *
 * Both methods swallow their own failures: a cache is optional by construction, so a database
 * hiccup here must cost at most one extra Jev call and must never reach the visitor. The stored
 * payload is validated on the way out — we wrote it, but a future shape change would otherwise
 * turn old rows into filters nobody asked for.
 */

import { eq } from "drizzle-orm";
import * as z from "zod";

import { db } from "@/db";
import { searchInterpretations } from "@/schema";
import { isGameModeSlug } from "@/lib/servers/game-modes";
import { isServerCountryCode } from "@/lib/servers/countries";
import { isCatalogAccessFilter, isCatalogEdition } from "@/lib/servers/catalog-filters";
import type { CachedInterpretation, SearchCacheEntry, SearchCacheStore } from "./cache";

/**
 * Rows written before a facet existed no longer match this shape, so they are read as a miss and
 * the query is asked again. That is the intended cost of widening what a reading can hold: an old
 * row is re-earned within one TTL, where migrating it would mean guessing what it would have said.
 */
const storedInterpretation = z.object({
  filters: z.object({
    modes: z.array(z.string().refine(isGameModeSlug)),
    countries: z.array(z.string().refine(isServerCountryCode)),
    access: z.array(z.string().refine(isCatalogAccessFilter)),
    edition: z.string().refine(isCatalogEdition).optional(),
  }),
  suggested: z.array(z.object({
    kind: z.enum(["mode", "country", "region", "access", "edition"]),
    value: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  namesServer: z.boolean(),
  needsSemantic: z.number().min(0).max(1),
  model: z.string(),
});

export const postgresSearchCache: SearchCacheStore = {
  async read(hash: string): Promise<SearchCacheEntry | null> {
    try {
      const [row] = await db
        .select({ interpretation: searchInterpretations.interpretation, updatedAt: searchInterpretations.updatedAt })
        .from(searchInterpretations)
        .where(eq(searchInterpretations.queryHash, hash))
        .limit(1);
      if (!row) return null;

      const parsed = storedInterpretation.safeParse(row.interpretation);
      if (!parsed.success) return null;
      return { interpretation: parsed.data as CachedInterpretation, storedAt: row.updatedAt };
    } catch (error) {
      console.error("[search] interpretation cache unreadable", error instanceof Error ? error.name : "unknown");
      return null;
    }
  },

  async write(hash: string, query: string, interpretation: CachedInterpretation) {
    try {
      const now = new Date();
      await db
        .insert(searchInterpretations)
        .values({ queryHash: hash, query, model: interpretation.model, interpretation, createdAt: now, updatedAt: now })
        // A repeat write is a refresh: the query is the same, the reading may not be.
        .onConflictDoUpdate({
          target: searchInterpretations.queryHash,
          set: { model: interpretation.model, interpretation, updatedAt: now },
        });
    } catch (error) {
      console.error("[search] interpretation cache unwritable", error instanceof Error ? error.name : "unknown");
    }
  },
};
