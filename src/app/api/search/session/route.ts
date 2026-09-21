import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

import { RateLimitExceededError, consumeRateLimit } from "@/lib/rate-limit";
import { startSearchSession } from "@/lib/search/runtime";
import { SEARCH_SESSION_COOKIE, SEARCH_SESSION_TTL_MS } from "@/lib/search/session";
import { requestIp } from "@/lib/search/request-ip";

/** Enough for a focus, a retry and an interactive challenge; not enough to farm siteverify. */
const SESSION_ATTEMPTS_PER_MINUTE = 10;

export async function POST(request: Request) {
  const ip = requestIp(await headers());

  try {
    await consumeRateLimit(`ai-search:session-start:${ip}`, SESSION_ATTEMPTS_PER_MINUTE, 60_000);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } });
    }
    // The counter is broken, not the visitor: let the verification through rather than locking
    // everyone out of a feature that is itself optional.
    console.error("[search] session rate limit unavailable", error instanceof Error ? error.name : "unknown");
  }

  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ ok: false, reason: "rejected" }, { status: 400 });

  const result = await startSearchSession({ token, remoteIp: ip === "unknown" ? undefined : ip });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: result.reason === "unavailable" ? 503 : 403 });
  }

  // HttpOnly: the token is proof for the server, and the page never needs to read it.
  (await cookies()).set(SEARCH_SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SEARCH_SESSION_TTL_MS / 1000),
  });

  return NextResponse.json({ ok: true, quota: result.quota, expiresAt: result.expiresAt.toISOString() });
}
