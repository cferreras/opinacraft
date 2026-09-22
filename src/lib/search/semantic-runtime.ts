/**
 * Where per-server judging meets the catalog, the monitor and the clock.
 *
 * Everything above this file takes its dependencies as arguments and is tested without a network, a
 * database or a key. This is the one place that assembles the real thing: the static half of each
 * profile from Postgres, the live half from the monitor, the scores already known from the cache,
 * and the judgements still missing from Jev.
 *
 * It never throws. Every failure here has the same answer — fewer servers judged, or none — and the
 * caller still has the facet interpretation to show, which is a real result rather than an apology.
 */

import { searchCacheKey } from "./cache";
import {
  createSemanticScorer,
  rankScores,
  scoreCatalog,
  type Ranking,
  type SemanticCaller,
  type SemanticScorer,
  type ServerScore,
} from "./semantic";
import { noSemanticScoreStore, postgresSemanticScoreStore, type SemanticScoreStore } from "./semantic-store";
import { allowSemanticSearch, semanticSearchConfig, type SemanticSearchConfig } from "./runtime";
import { identifyProfile, type IdentifiedServerProfile, type ServerProfileSource } from "@/lib/servers/server-profiles";
import { listServerProfileFacts, type ServerProfileFacts } from "@/lib/servers/queries";
import { fetchMonitorStatuses } from "@/lib/servers/monitor-api-client";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { SearchFilters } from "./bands";

/**
 * Only what the visitor literally wrote may narrow the field.
 *
 * This is the one narrowing that is not circular. Picking candidates by text similarity would use
 * the weakest signal to decide what the strongest one is allowed to see; honouring "en latam" uses a
 * word the visitor actually typed. A Spanish server does not satisfy "en latam" however well it
 * scores, so leaving it out loses nothing and saves a request.
 *
 * Inferred facets are deliberately not applied: those are guesses about the same words the
 * per-server judgement is already weighing.
 */
export function restrictToExactFilters(facts: readonly ServerProfileFacts[], exact: SearchFilters) {
  return facts.filter((server) => {
    if (exact.countries.length > 0 && !(server.country && exact.countries.includes(server.country))) return false;
    if (exact.modes.length > 0 && !server.gameModes.some((mode) => exact.modes.includes(mode))) return false;
    if (exact.edition && !server.editions.includes(exact.edition)) return false;
    // Access is stored as a pair of columns the catalog turns into four named values; reproducing
    // that mapping here would duplicate `catalogAccessCriteria`, so access narrows nothing and the
    // judgement weighs it from the profile instead. It is the rarest of the four in a typed query.
    return true;
  });
}

/**
 * The live half of a profile. Postgres has a copy of these columns, but it stopped being written
 * when the monitor moved to its own database, and a stale player count is worse than none at all for
 * a question about "pocos jugadores": it would be answered confidently and wrongly.
 */
async function liveStatuses(serverIds: readonly string[]) {
  if (serverIds.length === 0) return new Map<string, { playersCurrent: number | null; playersMax: number | null; version: string | null; healthStatus: "unknown" | "online" | "offline" }>();

  try {
    const states = await fetchMonitorStatuses(serverIds);
    if (!states) return null;
    return new Map(states.map((state) => [state.serverId, {
      playersCurrent: state.playersCurrent,
      playersMax: state.playersMax,
      version: state.version,
      // A report nobody has refreshed is not a report. The profile says "sin datos recientes"
      // rather than claiming a server is online because it was an hour ago.
      healthStatus: state.freshness === "fresh" ? state.healthStatus : "unknown" as const,
    }]));
  } catch (error) {
    console.warn("[search] monitor unavailable for semantic profiles", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

function toProfileSource(facts: ServerProfileFacts, live: Awaited<ReturnType<typeof liveStatuses>>): ServerProfileSource {
  const status = live?.get(facts.id);
  return {
    id: facts.id,
    name: facts.name,
    description: facts.description,
    country: facts.country,
    accessType: facts.accessType,
    accountMode: facts.accountMode,
    gameModes: facts.gameModes,
    editions: facts.editions,
    monitorVersion: status?.version ?? null,
    playersCurrent: status?.playersCurrent ?? null,
    playersMax: status?.playersMax ?? null,
    healthStatus: status?.healthStatus ?? "unknown",
  };
}

let cachedScorer: { apiKey: string; timeoutMs: number; scorer: SemanticScorer } | undefined;

function scorerFor(config: SemanticSearchConfig): SemanticScorer {
  if (cachedScorer && cachedScorer.apiKey === config.apiKey && cachedScorer.timeoutMs === config.timeoutMs) return cachedScorer.scorer;

  const scorer = createSemanticScorer({
    client: new TypeSafeClient({ apiKey: config.apiKey, timeout: config.timeoutMs, retry: { maxRetries: 0 }, logLevel: "warn" }) as unknown as SemanticCaller,
    timeoutMs: config.timeoutMs,
    // Logged without anything identifying, so the show threshold can be retuned against what
    // visitors really type rather than against the seed data it was first measured on.
    onBatch: (query, scores, model) => {
      const best = [...scores].sort((a, b) => b.score - a.score)[0];
      console.info("[search] semantic batch", JSON.stringify({ query, model, judged: scores.length, best: best?.score ?? null }));
    },
    onFailure: (_query, error) => console.warn("[search] semantic batch failed", error instanceof Error ? error.name : "unknown"),
  });

  cachedScorer = { apiKey: config.apiKey, timeoutMs: config.timeoutMs, scorer };
  return scorer;
}

export type SemanticSearchOutcome =
  | { ran: false; reason: "unconfigured" | "refused" | "nothing-to-judge" }
  | { ran: true; ranking: Ranking; judged: number; partial: boolean };

export type RunSemanticSearchDeps = {
  facts?: () => Promise<ServerProfileFacts[]>;
  store?: SemanticScoreStore;
  scorer?: SemanticScorer;
  allow?: (requests: number) => Promise<boolean>;
};

/**
 * Judges the catalog against one query and returns what to show.
 *
 * The order of the steps is the order in which they are allowed to spend: the catalog and the
 * monitor are cheap, the cache is cheaper than inference, and the ceilings are asked about *after*
 * we know how many requests are actually missing — charging for three hundred when the cache
 * already holds two hundred and ninety would close the road for no reason.
 */
export async function runSemanticSearch(
  normalizedQuery: string,
  exact: SearchFilters,
  { sessionId, ip }: { sessionId: string | null; ip: string },
  deps: RunSemanticSearchDeps = {},
): Promise<SemanticSearchOutcome> {
  const config = semanticSearchConfig();
  if (!config) return { ran: false, reason: "unconfigured" };

  const {
    facts: loadFacts = listServerProfileFacts,
    store = postgresSemanticScoreStore,
    scorer = scorerFor(config),
    allow = (requests: number) => allowSemanticSearch({ config, sessionId, ip, requests }),
  } = deps;

  let candidates: ServerProfileFacts[];
  try {
    candidates = restrictToExactFilters(await loadFacts(), exact);
  } catch (error) {
    console.error("[search] could not read server profiles", error instanceof Error ? error.name : "unknown");
    return { ran: false, reason: "nothing-to-judge" };
  }
  if (candidates.length === 0) return { ran: false, reason: "nothing-to-judge" };

  const live = await liveStatuses(candidates.map((server) => server.id));
  const profiles: IdentifiedServerProfile[] = candidates.map((server) => identifyProfile(toProfileSource(server, live)));

  const queryHash = searchCacheKey(normalizedQuery);
  const cached = await store.read(queryHash, profiles.map((entry) => entry.serverId));
  const known = new Map(cached.map((score) => [score.serverId, score]));
  const missing = profiles.filter((entry) => known.get(entry.serverId)?.profileHash !== entry.profileHash);

  // Nothing to pay for: the whole catalog is already judged for this query.
  if (missing.length === 0) {
    return { ran: true, ranking: rankScores(cached, config.showThreshold), judged: cached.length, partial: false };
  }

  if (!(await allow(missing.length))) {
    // Refused, but what the cache already holds is a real ranking, so it is still worth showing.
    if (cached.length > 0) {
      return { ran: true, ranking: rankScores(cached, config.showThreshold), judged: cached.length, partial: true };
    }
    return { ran: false, reason: "refused" };
  }

  const scored = await scoreCatalog(normalizedQuery, profiles, {
    scorer,
    cached,
    concurrency: config.concurrency,
    deadlineMs: config.deadlineMs,
  });

  if (scored.fresh.length > 0) {
    // Written before ranking, and awaited: the next visitor typing the same thing is the whole point.
    await store.write(queryHash, scored.fresh, scored.model);
  }

  return {
    ran: true,
    ranking: rankScores(scored.scores, config.showThreshold),
    judged: scored.scores.length,
    partial: scored.partial,
  };
}

export { noSemanticScoreStore };
export type { ServerScore };
