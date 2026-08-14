import "dotenv/config";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { authRelations } from "./auth-schema";
import { relations } from "./relations";

function secureConnectionString(connectionString: string) {
  if (/[?&]sslmode=/i.test(connectionString)) {
    return connectionString.replace(
      /([?&]sslmode=)(prefer|require|verify-ca)(?=(&|$))/i,
      "$1verify-full",
    );
  }
  const separator = connectionString.includes("?")
    ? connectionString.endsWith("?") || connectionString.endsWith("&")
      ? ""
      : "&"
    : "?";
  return `${connectionString}${separator}sslmode=verify-full`;
}

const globalForDb = globalThis as typeof globalThis & { opinacraftPool?: Pool; opinacraftLockPool?: Pool; opinacraftRateLimitPool?: Pool };
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
}
const pool = globalForDb.opinacraftPool ?? new Pool({
  connectionString: secureConnectionString(databaseUrl),
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
});
const lockPool = globalForDb.opinacraftLockPool ?? new Pool({
  connectionString: secureConnectionString(databaseUrl),
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
});
const rateLimitPool = globalForDb.opinacraftRateLimitPool ?? new Pool({
  connectionString: secureConnectionString(databaseUrl),
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
});
if (process.env.NODE_ENV !== "production") {
  globalForDb.opinacraftPool = pool;
  globalForDb.opinacraftLockPool = lockPool;
  globalForDb.opinacraftRateLimitPool = rateLimitPool;
}

export const db = drizzle({
  client: pool,
  relations: { ...relations, ...authRelations },
});

export const rateLimitDb = drizzle({ client: rateLimitPool });

export async function withAdvisoryLock<T>(lockName: string, operation: () => Promise<T>) {
  const client = await lockPool.connect();
  let unlockError: Error | undefined;
  try {
    const result = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtext($1)) as acquired",
      [lockName],
    );
    if (!result.rows[0]?.acquired) return null;
    try {
      return await operation();
    } finally {
      try {
        await client.query("select pg_advisory_unlock(hashtext($1))", [lockName]);
      } catch (error) {
        unlockError = error instanceof Error ? error : new Error("Failed to release advisory lock");
        console.error("[db] failed to release advisory lock", lockName, error);
      }
    }
  } finally {
    client.release(unlockError);
  }
}

export async function closeDatabase() {
  await Promise.all([
    pool.end(),
    lockPool.end(),
    rateLimitPool.end(),
  ]);
  globalForDb.opinacraftPool = undefined;
  globalForDb.opinacraftLockPool = undefined;
  globalForDb.opinacraftRateLimitPool = undefined;
}
