/**
 * Where the search pipeline meets the environment: the API key, the ceilings, the counters and
 * the clock. Everything above this file takes its dependencies as arguments and can be tested
 * without a database, a network or a key; this is the one place that reads `serverEnv`.
 *
 * Natural-language search is off unless it has been configured on purpose. Missing a key, a
 * Turnstile secret or a session secret is not an error: the catalog keeps its keyword search and
 * the route reports that the AI part is unavailable.
 */

import { serverEnv } from "@/env/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { claimJevCall } from "./budget";
import { createJevAsk, createJevClient, type JevAsk, type JevReading } from "./jev";
import { interpretSearchQuery, type SearchInterpretation } from "./interpret";
import { postgresSearchCache } from "./store";
import { SEARCH_SESSION_TTL_MS, issueSearchSession, verifySearchSession } from "./session";
import { verifyTurnstileToken } from "./turnstile";

export type AiSearchConfig = {
  apiKey: string;
  turnstileSecret: string;
  sessionSecret: string;
  dailyLimit: number;
  sessionQuota: number;
  timeoutMs: number;
  ttlHours: number;
};

/** The whole feature in one check: every secret present and the flag on. */
export function aiSearchConfig(): AiSearchConfig | null {
  if (serverEnv.JEV_SEARCH_ENABLED !== "true") return null;
  const apiKey = serverEnv.TYPESAFE_API_KEY;
  const turnstileSecret = serverEnv.TURNSTILE_SECRET_KEY;
  const sessionSecret = serverEnv.AI_SEARCH_SESSION_SECRET;
  if (!apiKey || !turnstileSecret || !sessionSecret) return null;

  return {
    apiKey,
    turnstileSecret,
    sessionSecret,
    dailyLimit: serverEnv.JEV_DAILY_CALL_LIMIT,
    sessionQuota: serverEnv.AI_SEARCH_SESSION_QUOTA,
    timeoutMs: serverEnv.JEV_TIMEOUT_MS,
    ttlHours: serverEnv.JEV_CACHE_TTL_HOURS,
  };
}

export function isAiSearchConfigured() {
  return aiSearchConfig() !== null;
}

/**
 * The reading is logged with the query and the confidences, and without anything identifying, so
 * the 0.9/0.5 bands can be retuned against what visitors really type instead of by guesswork.
 */
function logReading(query: string, reading: JevReading) {
  console.info("[search] jev reading", JSON.stringify({
    query,
    model: reading.model,
    modes: reading.modes,
    country: reading.country,
    namesServer: reading.nameSearchProbability,
  }));
}

let cachedAsk: { apiKey: string; timeoutMs: number; ask: JevAsk } | undefined;

function askFor(config: AiSearchConfig): JevAsk {
  // The client holds a connection pool, so it is built once per configuration and reused.
  if (cachedAsk && cachedAsk.apiKey === config.apiKey && cachedAsk.timeoutMs === config.timeoutMs) return cachedAsk.ask;
  const ask = createJevAsk({
    client: createJevClient({ apiKey: config.apiKey, timeoutMs: config.timeoutMs }),
    timeoutMs: config.timeoutMs,
    onReading: logReading,
    onFailure: (_query, error) => console.warn("[search] jev unavailable", error instanceof Error ? error.name : "unknown"),
  });
  cachedAsk = { apiKey: config.apiKey, timeoutMs: config.timeoutMs, ask };
  return ask;
}

/**
 * Inference is allowed when the global allowance for today still has room *and* this visitor's
 * session still has credits. The global ceiling is checked first: protecting the bill matters more
 * than the accounting of one visitor's twenty searches.
 */
function allowInferenceFor(config: AiSearchConfig, sessionId: string | null) {
  return async () => {
    if (!sessionId) return false;

    const withinDailyLimit = await claimJevCall({
      limit: config.dailyLimit,
      consume: consumeRateLimit,
      onRefused: (reason) => console.warn(`[search] jev budget refused: ${reason}`),
    });
    if (!withinDailyLimit) return false;

    try {
      await consumeRateLimit(`ai-search:session:${sessionId}`, config.sessionQuota, SEARCH_SESSION_TTL_MS);
      return true;
    } catch (error) {
      console.warn("[search] session quota refused", error instanceof Error ? error.name : "unknown");
      return false;
    }
  };
}

export type InterpretForRequestResult = SearchInterpretation & {
  /** False when the feature is off or unconfigured, so the UI can say so once and move on. */
  aiAvailable: boolean;
};

/**
 * Interpret a query on behalf of a request. With no session, no configuration or no budget the
 * result is still a usable answer: the dictionary filters when it can, and keywords when it cannot.
 */
export async function interpretForRequest(query: string, { sessionId }: { sessionId: string | null }): Promise<InterpretForRequestResult> {
  const config = aiSearchConfig();
  if (!config) {
    const interpretation = await interpretSearchQuery(query, { ask: async () => null, allowInference: async () => false });
    return { ...interpretation, aiAvailable: false };
  }

  const interpretation = await interpretSearchQuery(query, {
    ask: askFor(config),
    cache: postgresSearchCache,
    allowInference: allowInferenceFor(config, sessionId),
    ttlHours: config.ttlHours,
  });
  return { ...interpretation, aiAvailable: true };
}

/** Exchanges a Turnstile token for a signed session, or reports why it could not. */
export async function startSearchSession({ token, remoteIp }: { token: string; remoteIp?: string }) {
  const config = aiSearchConfig();
  if (!config) return { ok: false as const, reason: "unavailable" as const };

  const verification = await verifyTurnstileToken({ token, secret: config.turnstileSecret, remoteIp });
  if (!verification.ok) {
    console.warn("[search] turnstile rejected a token", verification.errorCodes?.join(",") ?? "unknown");
    return { ok: false as const, reason: "rejected" as const };
  }

  const session = issueSearchSession(config.sessionSecret);
  return { ok: true as const, ...session, quota: config.sessionQuota };
}

export function sessionIdFromToken(token: string | undefined) {
  const config = aiSearchConfig();
  if (!config) return null;
  return verifySearchSession(token, config.sessionSecret);
}
