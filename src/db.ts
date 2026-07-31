import "dotenv/config";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { authRelations } from "./auth-schema";
import { serverEnv } from "./env/server";
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

const globalForDb = globalThis as typeof globalThis & { opinacraftPool?: Pool; opinacraftLockPool?: Pool };
const pool = globalForDb.opinacraftPool ?? new Pool({
  connectionString: secureConnectionString(serverEnv.DATABASE_URL),
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
});
const lockPool = globalForDb.opinacraftLockPool ?? new Pool({
  connectionString: secureConnectionString(serverEnv.DATABASE_URL),
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
});
if (process.env.NODE_ENV !== "production") {
  globalForDb.opinacraftPool = pool;
  globalForDb.opinacraftLockPool = lockPool;
}

export const db = drizzle({
  client: pool,
  relations: { ...relations, ...authRelations },
});

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
  if (!globalForDb.opinacraftPool && !globalForDb.opinacraftLockPool) return;
  await Promise.all([
    globalForDb.opinacraftPool?.end(),
    globalForDb.opinacraftLockPool?.end(),
  ]);
  globalForDb.opinacraftPool = undefined;
  globalForDb.opinacraftLockPool = undefined;
}
