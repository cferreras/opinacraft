import type { PoolClient } from "pg";

import { createPostgresPool } from "@/lib/postgres";

const globalForMonitor = globalThis as typeof globalThis & {
  opinacraftMonitorPool?: ReturnType<typeof createPostgresPool>;
};

export function getMonitorPool() {
  const connectionString = process.env.MONITOR_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("MONITOR_DATABASE_URL is required for Monitor DB.");
  globalForMonitor.opinacraftMonitorPool ??= createPostgresPool(connectionString, {
    max: 8,
    enforceTls: process.env.MONITOR_DATABASE_SSL === "true",
  });
  return globalForMonitor.opinacraftMonitorPool;
}

async function setUtc(client: PoolClient) {
  await client.query("set time zone 'UTC'");
}

export async function withMonitorClient<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await getMonitorPool().connect();
  try {
    await setUtc(client);
    return await operation(client);
  } finally {
    client.release();
  }
}

export async function withMonitorTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  return withMonitorClient(async (client) => {
    await client.query("begin");
    await client.query("set local time zone 'UTC'");
    try {
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  });
}

export async function closeMonitorDatabase() {
  if (!globalForMonitor.opinacraftMonitorPool) return;
  await globalForMonitor.opinacraftMonitorPool.end();
  globalForMonitor.opinacraftMonitorPool = undefined;
}
