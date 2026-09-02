import { normalizeCspReports } from "@/lib/security/csp-report";

/**
 * Where the Report-Only policy in `next.config.ts` sends its violations.
 *
 * Unauthenticated by necessity: a browser posts a violation report with no credentials, and a
 * report that has to be signed in is a report that never arrives. That makes the body arbitrary
 * text from an arbitrary poster, so nothing here is stored, echoed or trusted -- reports are
 * clipped to their diagnosable fields and written to the platform log, which is where the policy
 * gets read before anyone decides to enforce it.
 */

/** A CSP report is a few hundred bytes; a batched one, a few thousand. Beyond this it is not one. */
const MAX_BODY_BYTES = 64 * 1024;

const REPORT_CONTENT_TYPES = ["application/csp-report", "application/reports+json", "application/json"];

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!REPORT_CONTENT_TYPES.includes(contentType) || length > MAX_BODY_BYTES) return new Response(null, { status: 204 });

  const payload = await request.json().catch(() => null);
  for (const violation of normalizeCspReports(payload)) {
    console.warn("csp-violation", violation);
  }

  // 204 whatever happened. The browser has nothing to do with the answer, and a poster probing the
  // endpoint learns nothing from it either.
  return new Response(null, { status: 204 });
}
