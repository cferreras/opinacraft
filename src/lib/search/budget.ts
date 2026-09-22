/**
 * The daily ceiling on what natural-language search may spend.
 *
 * The counter is the rate limiter the site already runs on Postgres, keyed by the UTC date: one
 * row per day, incremented once per call that actually reaches Jev. Cached and dictionary answers
 * never come through here, because they cost nothing.
 *
 * It fails closed. If the counter cannot be read or written, the call is refused and the visitor
 * gets the keyword search: an unavailable ceiling is not a licence to spend without one.
 */

export type RateLimitConsumer = (key: string, limit: number, windowMs: number, units?: number) => Promise<unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One bucket per UTC day, so the allowance resets at a time nobody has to compute. */
export function jevBudgetKey(now: Date) {
  return `jev:daily:${now.toISOString().slice(0, 10)}`;
}

/**
 * A separate daily allowance for per-server judging. It is separate so the two cannot starve each
 * other: a day of expensive searches must still leave the cheap facet reading working, because that
 * one is what the whole catalog relies on.
 */
export function semanticBudgetKey(now: Date) {
  return `jev:semantic:daily:${now.toISOString().slice(0, 10)}`;
}

export type ClaimJevCallOptions = {
  limit: number;
  consume: RateLimitConsumer;
  now?: Date;
  onRefused?: (reason: "limit" | "unavailable", error?: unknown) => void;
  /**
   * How many requests this claim is about. One for a facet reading; one per batch for a semantic
   * search, which is the whole reason this is not always 1 — a ceiling that counts twenty requests
   * as one unit is not a ceiling.
   */
  units?: number;
  /** Which allowance to charge, so the expensive road cannot spend the cheap road's budget. */
  key?: (now: Date) => string;
};

/** True when this call is within today's allowance and has been counted against it. */
export async function claimJevCall({ limit, consume, now = new Date(), onRefused, units = 1, key = jevBudgetKey }: ClaimJevCallOptions): Promise<boolean> {
  if (!Number.isFinite(limit) || limit <= 0) {
    onRefused?.("limit");
    return false;
  }

  try {
    await consume(key(now), limit, DAY_MS, units);
    return true;
  } catch (error) {
    // The limiter throws `RateLimitExceededError` on the call past the ceiling, and anything else
    // when the counter itself is broken. Both mean the same thing here: do not call Jev.
    onRefused?.(error instanceof Error && error.name === "RateLimitExceededError" ? "limit" : "unavailable", error);
    return false;
  }
}
