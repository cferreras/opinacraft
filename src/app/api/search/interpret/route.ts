import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

import { RateLimitExceededError, consumeRateLimit } from "@/lib/rate-limit";
import { buildCatalogHref } from "@/lib/servers/catalog-route";
import { interpretForRequest, sessionIdFromToken } from "@/lib/search/runtime";
import { MAX_SEARCH_QUERY_LENGTH } from "@/lib/search/normalize";
import { SEARCH_SESSION_COOKIE } from "@/lib/search/session";
import { requestIp } from "@/lib/search/request-ip";

/** A debounced search box types a handful of queries a minute; a script types more. */
const INTERPRETATIONS_PER_MINUTE = 30;

/**
 * Facets the search box does not own. A visitor who filtered by version and then typed a query
 * keeps the version; `q`, `mode`, `country` and `page` are exactly what this answer replaces.
 */
const preservedParams = ["version", "access", "edition", "status", "sort", "tableSort", "tableDirection"] as const;

function preserved(search: unknown) {
  const kept: Record<string, string> = {};
  if (typeof search !== "string" || !search) return kept;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of preservedParams) {
    const value = params.get(key);
    if (value) kept[key] = value;
  }
  return kept;
}

export async function POST(request: Request) {
  const ip = requestIp(await headers());

  try {
    await consumeRateLimit(`ai-search:interpret:${ip}`, INTERPRETATIONS_PER_MINUTE, 60_000);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: "Demasiadas búsquedas seguidas. Espera unos segundos." }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } });
    }
    console.error("[search] interpret rate limit unavailable", error instanceof Error ? error.name : "unknown");
  }

  const body = await request.json().catch(() => null) as { q?: unknown; search?: unknown } | null;
  const query = typeof body?.q === "string" ? body.q.slice(0, MAX_SEARCH_QUERY_LENGTH * 2) : "";

  const sessionId = sessionIdFromToken((await cookies()).get(SEARCH_SESSION_COOKIE)?.value);
  const interpretation = await interpretForRequest(query, { sessionId });

  const href = buildCatalogHref({
    ...preserved(body?.search),
    q: interpretation.keyword,
    mode: interpretation.filters.modes,
    country: interpretation.filters.country,
  });

  return NextResponse.json({
    source: interpretation.source,
    filters: interpretation.filters,
    suggested: interpretation.suggested,
    keyword: interpretation.keyword,
    aiAvailable: interpretation.aiAvailable,
    // Built here so the client navigates to a URL the catalog itself could have produced.
    href,
  });
}
