/**
 * The address a rate-limit key is built from.
 *
 * Vercel and Cloudflare both put the client address first in `x-forwarded-for`; the rest of the
 * list is proxies. Anything unparseable becomes a single shared bucket rather than a free pass,
 * which is the conservative way round for a counter.
 */
export function requestIp(requestHeaders: Headers) {
  const forwarded = requestHeaders.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || requestHeaders.get("x-real-ip")?.trim() || "unknown";
}
