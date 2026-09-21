/**
 * Cloudflare Turnstile, server side.
 *
 * The widget runs invisibly and is executed when the visitor focuses the search box, so by the
 * time a natural-language search is attempted there is usually a token to exchange for a session.
 * A failure here is never fatal: the caller turns it into "AI search unavailable" and the ordinary
 * catalog search carries on, with an interactive challenge offered as the way back.
 */

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
