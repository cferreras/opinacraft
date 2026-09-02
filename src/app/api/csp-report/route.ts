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

/**
 * Reads the body while counting bytes, and gives up the moment it passes the limit.
 *
 * `Content-Length` cannot carry the limit on its own: a chunked request omits the header entirely,
 * so a check against it reads zero and waves the request through to be buffered whole. The count
 * has to happen against the bytes actually arriving.
 */
async function readBoundedText(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    // A truncated or aborted upload is not a report.
    return null;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  // The header is the cheap rejection when a poster declares an honest oversized length; the read
  // below is the one that actually holds.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!REPORT_CONTENT_TYPES.includes(contentType) || declared > MAX_BODY_BYTES) return new Response(null, { status: 204 });

  const text = await readBoundedText(request, MAX_BODY_BYTES);
  if (text !== null) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    for (const violation of normalizeCspReports(payload)) {
      console.warn("csp-violation", violation);
    }
  }

  // 204 whatever happened. The browser has nothing to do with the answer, and a poster probing the
  // endpoint learns nothing from it either.
  return new Response(null, { status: 204 });
}
