/**
 * The Postgres side of the per-server score cache.
 *
 * Both methods swallow their own failures, like the interpretation cache does: a cache is optional
 * by construction, so a database hiccup costs at most one more round of judging and must never reach
 * the visitor. A read that cannot be trusted is reported as a miss, which is always safe — the worst
 * case is asking again.
 *
 * Rows are matched on `profileHash` by the caller, not here: this module's job is to hand back what
 * was stored, and `scoreCatalog` decides which of those answers still belong to the server they
 * were given about.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { searchServerScores } from "@/schema";
import type { ServerScore } from "./semantic";

export type SemanticScoreStore = {
  read: (queryHash: string, serverIds: readonly string[]) => Promise<ServerScore[]>;
  write: (queryHash: string, scores: readonly ServerScore[], model: string) => Promise<void>;
};

/** A store that remembers nothing, for the tests and paths that should not depend on one. */
export const noSemanticScoreStore: SemanticScoreStore = {
  read: async () => [],
  write: async () => {},
};

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export const postgresSemanticScoreStore: SemanticScoreStore = {
  async read(queryHash, serverIds) {
    if (serverIds.length === 0) return [];

    try {
      const rows = await db
        .select({
          serverId: searchServerScores.serverId,
          score: searchServerScores.score,
          profileHash: searchServerScores.profileHash,
        })
        .from(searchServerScores)
        .where(and(
          eq(searchServerScores.queryHash, queryHash),
          // Scoped to the servers actually being ranked, so a catalog that shrank does not drag
          // scores for servers nobody can see any more into the ranking.
          inArray(searchServerScores.serverId, [...serverIds]),
        ));

      // A row written by an older shape, or a score outside 0-1, is a miss rather than a filter
      // nobody asked for.
      return rows.filter((row): row is ServerScore => isProbability(row.score) && typeof row.profileHash === "string");
    } catch (error) {
      console.error("[search] server scores unreadable", error instanceof Error ? error.name : "unknown");
      return [];
    }
  },

  async write(queryHash, scores, model) {
    if (scores.length === 0) return;

    try {
      const now = new Date();
      await db
        .insert(searchServerScores)
        .values(scores.map((entry) => ({
          queryHash,
          serverId: entry.serverId,
          score: entry.score,
          profileHash: entry.profileHash,
          model,
          createdAt: now,
          updatedAt: now,
        })))
        // A repeat write is a refresh: the query is the same, the server's profile may not be.
        .onConflictDoUpdate({
          target: [searchServerScores.queryHash, searchServerScores.serverId],
          set: {
            score: sqlExcluded("score"),
            profileHash: sqlExcluded("profile_hash"),
            model: sqlExcluded("model"),
            updatedAt: now,
          },
        });
    } catch (error) {
      console.error("[search] server scores unwritable", error instanceof Error ? error.name : "unknown");
    }
  },
};

/** Lets one upsert carry the whole batch: three hundred round trips would cost more than judging. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
