/**
 * Normalising the two shapes a CSP violation arrives in.
 *
 * A `Report-Only` policy that names no reporting endpoint is inert: the browser evaluates it,
 * finds the violations, and throws them away. Wiring one up means accepting both wire formats,
 * because neither is universally supported -- `report-uri` posts a lone `application/csp-report`
 * envelope (Safari and Firefox), and the newer `report-to` posts a batched
 * `application/reports+json` array (Chrome). The field names differ between them too, so both are
 * flattened here into the one record the route logs.
 *
 * The endpoint is necessarily unauthenticated -- browsers send reports without credentials -- so
 * everything in a report is untrusted text from an arbitrary poster. Fields are clipped and
 * stripped of control characters before they reach a log line, and only the handful worth reading
 * is kept: `original-policy` is our own header echoed back on every single report, and the rest of
 * the envelope says nothing a violation is diagnosed from.
 */
export type CspViolation = {
  directive: string;
  blockedUrl: string;
  documentUrl: string;
  sample: string;
  disposition: string;
};

/** Long enough to identify a blocked URL or an inline script; short enough to stay one log line. */
const MAX_FIELD_LENGTH = 300;

/** One page can violate a policy many times; a batch beyond this says nothing the first few didn't. */
const MAX_REPORTS = 20;

function field(value: unknown): string {
  if (typeof value !== "string") return "";
  // Newlines and escape sequences are collapsed rather than kept: a report is attacker-supplied
  // text on its way to a log line, and one violation should occupy one line.
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return clean.length > MAX_FIELD_LENGTH ? `${clean.slice(0, MAX_FIELD_LENGTH - 1)}…` : clean;
}

function violationFrom(body: Record<string, unknown>): CspViolation | null {
  // `effective-directive` is the precise one ("script-src-elem"); `violated-directive` is what
  // older browsers send instead. Either identifies the rule; without one there is nothing to read.
  const directive = field(body.effectiveDirective ?? body["effective-directive"] ?? body.violatedDirective ?? body["violated-directive"]);
  if (!directive) return null;
  return {
    directive,
    blockedUrl: field(body.blockedURL ?? body["blocked-uri"]),
    documentUrl: field(body.documentURL ?? body["document-uri"]),
    sample: field(body.sample ?? body["script-sample"]),
    disposition: field(body.disposition) || "report",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Reads either wire format, and anything unrecognisable as no violations at all. */
export function normalizeCspReports(payload: unknown): CspViolation[] {
  // `report-to`: an array of envelopes, of which only the CSP ones are ours to read.
  if (Array.isArray(payload)) {
    return payload.slice(0, MAX_REPORTS).flatMap((entry) => {
      const envelope = asRecord(entry);
      if (!envelope || (typeof envelope.type === "string" && envelope.type !== "csp-violation")) return [];
      const body = asRecord(envelope.body);
      const violation = body ? violationFrom(body) : null;
      return violation ? [violation] : [];
    });
  }

  const record = asRecord(payload);
  if (!record) return [];
  // `report-uri`: a single `{ "csp-report": { ... } }` envelope, or the bare body from a poster
  // that skipped it.
  const violation = violationFrom(asRecord(record["csp-report"]) ?? record);
  return violation ? [violation] : [];
}
