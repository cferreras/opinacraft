/**
 * The proof that a visitor passed Turnstile, and the allowance that comes with it.
 *
 * The token is a signed statement — an id and an expiry — and nothing else. In particular it does
 * not carry the remaining allowance: a counter inside a token the client holds can be replayed
 * from an earlier copy to refill itself, so the count lives server-side, keyed by the id (see the
 * session quota in `runtime.ts`). The token only answers "was this visitor verified, and when".
 *
 * Only searches that would reach Jev ask for one. A query the dictionary resolves, or one that
 * falls back to keywords, is served without any of this.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const SEARCH_SESSION_COOKIE = "opinacraft_search_session";
export const SEARCH_SESSION_TTL_MS = 30 * 60 * 1000;

type SessionPayload = {
  /** Opaque id. It keys the allowance and is not tied to an account, an IP or a device. */
  sid: string;
  /** Expiry, in epoch milliseconds. */
  exp: number;
};

function encode(value: object) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function issueSearchSession(secret: string, { now = new Date(), ttlMs = SEARCH_SESSION_TTL_MS }: { now?: Date; ttlMs?: number } = {}) {
  const payload: SessionPayload = { sid: randomUUID(), exp: now.getTime() + ttlMs };
  const body = encode(payload);
  return { token: `${body}.${sign(body, secret)}`, sid: payload.sid, expiresAt: new Date(payload.exp) };
}

/** The session id when the token is genuine and current, and `null` for every other case. */
export function verifySearchSession(token: string | undefined, secret: string, { now = new Date() }: { now?: Date } = {}): string | null {
  if (!token || !secret) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), "base64url");
  const expected = Buffer.from(sign(body, secret), "base64url");
  // Lengths are compared first because `timingSafeEqual` throws on a mismatch.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.sid !== "string" || !payload.sid) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= now.getTime()) return null;
    return payload.sid;
  } catch {
    return null;
  }
}
