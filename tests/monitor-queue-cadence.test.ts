import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost/opinacraft";

test("monitor cadence SQL casts both CASE branches to smallint", async () => {
  const [{ db }, { servers }, { getMonitorCadenceSql }] = await Promise.all([
    import("../src/db.ts"),
    import("../src/schema.ts"),
    import("../src/lib/servers/monitor-queue.ts"),
  ]);

  const query = db.select({ cadence: getMonitorCadenceSql() }).from(servers).toSQL();

  assert.match(query.sql, /then \$\d+::smallint else \$\d+::smallint end/);
});
