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

const globalForDb = globalThis as typeof globalThis & { opinacraftPool?: Pool };
const pool = globalForDb.opinacraftPool ?? new Pool({
  connectionString: secureConnectionString(serverEnv.DATABASE_URL),
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
});
if (process.env.NODE_ENV !== "production") globalForDb.opinacraftPool = pool;

export const db = drizzle({
  client: pool,
  relations: { ...relations, ...authRelations },
});
