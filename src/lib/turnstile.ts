/**
 * Cloudflare Turnstile, server side: the anti-bot check behind forms anyone can send without an
 * account, such as the vote page.
 *
 * The secret stays in this module. Callers only learn whether the visitor passed, failed, or
 * whether the check is not configured at all, and decide for themselves what that means.
 */

import { serverEnv } from "@/env/server";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 3000;

export type TurnstileVerification = {
  ok: boolean;
  /** Cloudflare's own codes, kept for the logs; never shown to the visitor. */
  errorCodes?: string[];
};

export type VerifyTurnstileOptions = {
  token: string;
  secret: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function verifyTurnstileToken({ token, secret, remoteIp, fetchImpl = fetch, timeoutMs = VERIFY_TIMEOUT_MS }: VerifyTurnstileOptions): Promise<TurnstileVerification> {
  if (!token || !secret) return { ok: false, errorCodes: ["missing-input"] };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, errorCodes: [`http-${response.status}`] };

    const result = await response.json() as { success?: boolean; "error-codes"?: string[] };
    return { ok: result.success === true, errorCodes: result["error-codes"] };
  } catch (error) {
    return { ok: false, errorCodes: [error instanceof Error ? error.name : "unknown"] };
  }
}

export async function verifyVisitorChallenge(token: string, remoteIp?: string): Promise<"ok" | "failed" | "unconfigured"> {
  const secret = serverEnv.TURNSTILE_SECRET_KEY;
  if (!secret) return "unconfigured";
  const verification = await verifyTurnstileToken({ token, secret, remoteIp });
  if (!verification.ok) console.warn("[turnstile] rejected a token", verification.errorCodes?.join(",") ?? "unknown");
  return verification.ok ? "ok" : "failed";
}
