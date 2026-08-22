import "dotenv/config";

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.MONITOR_DATABASE_URL?.trim();
if (!connectionString) throw new Error("MONITOR_DATABASE_URL is required.");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  ["0001_monitor", "0001_monitor.sql"],
  ["0002_monitor_hardening", "0002_monitor_hardening.sql"],
];
const pool = new pg.Pool({ connectionString });
try {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local time zone 'UTC'");
    await client.query("create table if not exists monitor_schema_migrations (id varchar(120) primary key, applied_at timestamptz not null default now())");
    for (const [id, file] of migrations) {
      const existing = await client.query("select 1 from monitor_schema_migrations where id = $1", [id]);
      if (existing.rowCount > 0) continue;
      const sql = await readFile(resolve(root, "src/monitor-migrations", file), "utf8");
      await client.query(sql);
      await client.query("insert into monitor_schema_migrations (id) values ($1)", [id]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
