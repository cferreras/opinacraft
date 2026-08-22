import type { PoolConfig } from "pg";
import { Pool } from "pg";

export type PostgresPoolOptions = PoolConfig & { enforceTls?: boolean };

export function secureConnectionString(connectionString: string) {
  if (/[?&]sslmode=/i.test(connectionString)) {
    return connectionString.replace(
      /([?&]sslmode=)(prefer|require|verify-ca)(?=(&|$))/i,
      "$1verify-full",
    );
  }
  const separator = connectionString.includes("?")
    ? connectionString.endsWith("?") || connectionString.endsWith("&") ? "" : "&"
    : "?";
  return `${connectionString}${separator}sslmode=verify-full`;
}

export function createPostgresPool(connectionString: string, options: PostgresPoolOptions = {}) {
  const { enforceTls = true, ...poolOptions } = options;
  return new Pool({
    connectionString: enforceTls ? secureConnectionString(connectionString) : connectionString,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    query_timeout: 15_000,
    keepAlive: true,
    ...poolOptions,
  });
}
