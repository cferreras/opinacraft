import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationsDir = "src/migrations";

function migrationFolders() {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function snapshotOf(folder: string) {
  const file = path.join(migrationsDir, folder, "snapshot.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as { id: string; prevIds: string[]; ddl: unknown[] };
}

test("every migration folder carries the SQL that drizzle-kit migrate applies", () => {
  for (const folder of migrationFolders()) {
    assert.ok(existsSync(path.join(migrationsDir, folder, "migration.sql")), `${folder} has no migration.sql`);
  }
});

/**
 * `drizzle-kit generate` diffs the schema against the newest snapshot it can find, not against the
 * database. A migration written by hand that leaves no snapshot behind therefore makes every later
 * `pnpm db:generate` diff against a stale schema: it asks to create tables that already exist, and
 * demands a `--hints` decision for each of them. That is exactly how this repository ended up with
 * seven migrations' worth of drift, so the invariant is worth a test rather than a habit.
 */
test("the newest migration leaves a snapshot, so db:generate diffs against today's schema", () => {
  const folders = migrationFolders();
  const newest = folders.at(-1);

  assert.ok(newest, "there should be at least one migration");
  assert.ok(
    snapshotOf(newest) !== null,
    `${newest} has no snapshot.json: run pnpm db:generate for the schema change instead of writing the SQL first, or regenerate the snapshot and move it into this folder (see docs/database-migrations.md)`,
  );
});

test("the newest snapshot continues the chain instead of starting a new one", () => {
  const folders = migrationFolders();
  const withSnapshots = folders.filter((folder) => snapshotOf(folder) !== null);

  assert.ok(withSnapshots.length >= 2, "there should be a chain to check");
  const newest = snapshotOf(withSnapshots.at(-1)!)!;
  const previous = snapshotOf(withSnapshots.at(-2)!)!;

  // A snapshot whose prevIds point somewhere else means two histories were generated in parallel,
  // and the losing one's migrations would be regenerated from scratch.
  assert.ok(newest.prevIds.includes(previous.id), `${withSnapshots.at(-1)} should follow ${withSnapshots.at(-2)}`);
  assert.ok(newest.ddl.length >= previous.ddl.length, "the newest snapshot should describe the whole schema");
});
