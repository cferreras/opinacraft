import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rateLimit } from "@/auth-schema";

type RateLimitReader = Pick<typeof db, "insert">;

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
  reader: RateLimitReader = db,
) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const namespacedKey = `opinacraft:${key}`;
  const [row] = await reader
    .insert(rateLimit)
    .values({ id: namespacedKey, key: namespacedKey, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: now,
      },
    })
    .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest });

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
