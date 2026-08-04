import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DIRECT_DATABASE_URL;

if (!connectionString) {
  throw new Error("Set DIRECT_DATABASE_URL before inspecting the database.");
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
});

try {
  const [{ rows: database }, { rows: migrationTables }, { rows: tests }] = await Promise.all([
    pool.query("select current_database() as database, current_user as user_name, current_setting('server_version') as server_version"),
    pool.query("select table_schema, table_name from information_schema.tables where table_name = '__drizzle_migrations' order by table_schema"),
    pool.query("select to_regclass('public.tests') as tests_table"),
  ]);

  console.log({
    database,
    migrationTables,
    tests,
  });

  if (tests[0]?.tests_table) {
    throw new Error("Residual public.tests table still exists.");
  }

  let migrationCount = 0;
  if (migrationTables.some((table) => table.table_schema === "drizzle")) {
    const { rows: migrations } = await pool.query(
      "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at",
    );
    migrationCount = migrations.length;
    console.log({ migrations });
  }

  if (tests[0]?.tests_table) {
    const { rows: testsCount } = await pool.query(
      "select count(*)::bigint as row_count from public.tests",
    );
    console.log({ testsCount });
  }

  const { rows: endpointViolations } = await pool.query(
    "select count(*)::bigint as row_count from server_endpoints where port < 1024 or port > 65535",
  );
  console.log({ endpointViolations });
  if (endpointViolations[0]?.row_count !== "0") {
    throw new Error("server_endpoints contains ports outside 1024-65535.");
  }

  const { rows: constraints } = await pool.query(
    "select conrelid::regclass::text as table_name, conname, contype, convalidated, pg_get_constraintdef(oid) as definition from pg_constraint where connamespace = 'public'::regnamespace and (conname like '%owner%' or conname like '%endpoint%' or conname like '%verification%') order by 1, 2",
  );
  console.log({ constraints });
  const endpointPortConstraint = constraints.find(
    (constraint) => constraint.conname === "server_endpoints_port_check",
  );
  if (!endpointPortConstraint?.convalidated) {
    throw new Error("server_endpoints_port_check is not validated.");
  }

  const { rows: indexes } = await pool.query(
    "select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by tablename, indexname",
  );
  console.log({ indexes });

  const { rows: triggers } = await pool.query(
    "select event_object_table, trigger_name, action_statement from information_schema.triggers where trigger_schema = 'public' order by event_object_table, trigger_name",
  );
  console.log({ triggers });

  console.log({
    summary: {
      migrationCount,
      testsTableRemoved: !tests[0]?.tests_table,
      endpointPortConstraintValidated: Boolean(endpointPortConstraint?.convalidated),
      verifiedEndpointIndexPresent: indexes.some(
        (index) => index.indexname === "server_endpoints_verified_edition_host_port_key",
      ),
      playerSnapshotTablePresent: indexes.some(
        (index) => index.tablename === "server_endpoint_player_snapshots",
      ),
      playerHourlyTablePresent: indexes.some(
        (index) => index.tablename === "server_endpoint_player_hourly",
      ),
      ownerTriggerPresent: triggers.some(
        (trigger) => trigger.trigger_name === "servers_owner_invariant_trigger",
      ),
    },
  });
} finally {
  await pool.end();
}
