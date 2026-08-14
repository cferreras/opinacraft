import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://localhost/opinacraft";

test("due monitor candidate selection locks only the base servers table", async () => {
  const [{ db }, { enqueueDueMonitorJobs }, { servers }] = await Promise.all([
    import("../src/db.ts"),
    import("../src/lib/servers/monitor-queue.ts"),
    import("../src/schema.ts"),
  ]);

  let lock: { strength: string; config: Record<string, unknown> } | undefined;
  const query = {
    from() { return this; },
    leftJoin() { return this; },
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    for(strength: string, config: Record<string, unknown>) {
      lock = { strength, config };
      return Promise.resolve([]);
    },
  };
  const transactionSource = db.transaction;
  const mutableDb = db as typeof db & { transaction: typeof db.transaction };
  mutableDb.transaction = (async (callback: (tx: unknown) => unknown) => callback({
    select() { return query; },
  })) as typeof db.transaction;

  try {
    await enqueueDueMonitorJobs(new Date("2026-08-14T12:00:00.000Z"), 50);
  } finally {
    mutableDb.transaction = transactionSource;
  }

  assert.equal(lock?.strength, "update");
  assert.equal(lock?.config.skipLocked, true);
  assert.equal(lock?.config.of, servers);
});
