import { sql } from "drizzle-orm";

import { rateLimitDb } from "@/db";
import { rateLimit } from "@/auth-schema";

const RATE_LIMIT_PRUNE_INTERVAL_MS = 60_000;
let longestWindowMs = 0;
let lastPrunedAt = 0;

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Has alcanzado el límite temporal. Inténtalo de nuevo más tarde.");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  longestWindowMs = Math.max(longestWindowMs, windowMs);
  const windowStart = now - windowMs;
  const namespacedKey = `opinacraft:${key}`;
  const [row] = await rateLimitDb
    .insert(rateLimit)
    .values({ id: namespacedKey, key: namespacedKey, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest });

  if (now - lastPrunedAt >= RATE_LIMIT_PRUNE_INTERVAL_MS) {
    lastPrunedAt = now;
    void rateLimitDb
      .delete(rateLimit)
      .where(sql`${rateLimit.lastRequest} < ${now - longestWindowMs}`)
      .catch((error) => console.error("[rate-limit] failed to prune stale rows", error));
  }

  if (!row || row.count <= limit) return row;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((row.lastRequest + windowMs - now) / 1000),
  );
  throw new RateLimitExceededError(retryAfterSeconds);
}

export function isUniqueViolation(error: unknown, fragment: string) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code = candidate.code ?? candidate.cause?.code;
  const constraint = candidate.constraint ?? candidate.cause?.constraint;
  return code === "23505" && typeof constraint === "string" && constraint.includes(fragment);
}
