import "dotenv/config";

import pg from "pg";

const { Pool } = pg;

// History seeding is intentionally opt-in. Requiring an explicit URL prevents a
// normal `pnpm db:seed` or a copied shell command from writing to a live database.
const databaseUrl = process.env.SEED_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set SEED_DATABASE_URL explicitly before seeding player history.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
  throw new Error("SEED_DATABASE_URL must use the postgres or postgresql protocol.");
}

const seedServerIds = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
  "20000000-0000-4000-8000-000000000005",
  "20000000-0000-4000-8000-000000000006",
  "20000000-0000-4000-8000-000000000007",
  "20000000-0000-4000-8000-000000000008",
];

const slotMilliseconds = 15 * 60 * 1000;
const historySlots = 90 * 24 * 60 / 15;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function alignToSlot(value) {
  return new Date(Math.floor(value.getTime() / slotMilliseconds) * slotMilliseconds);
}

function makeObservation(endpoint, endpointIndex, slotIndex, sampledAt, now) {
  const configuredCapacity = Number.isInteger(endpoint.players_max) && endpoint.players_max > 0 ? endpoint.players_max : null;
  const configuredPlayers = Number.isInteger(endpoint.players_current) && endpoint.players_current >= 0 ? endpoint.players_current : null;
  const capacity = configuredCapacity ?? Math.max(300, Math.round((configuredPlayers ?? 120) * 2.2));
  const baseline = configuredPlayers ?? Math.max(24, Math.round(capacity * 0.35));
  const dailyPhase = (sampledAt.getUTCHours() + sampledAt.getUTCMinutes() / 60) / 24 * Math.PI * 2;
  const weeklyPhase = sampledAt.getUTCDay() / 7 * Math.PI * 2;
  const variation = 0.78
    + 0.14 * Math.sin(dailyPhase - endpointIndex * 0.35)
    + 0.07 * Math.sin(weeklyPhase + endpointIndex * 0.2)
    + 0.035 * Math.sin(slotIndex * 0.41 + endpointIndex);

  let status = "online";
  if ((slotIndex + endpointIndex * 23) % 211 === 0) status = "unknown";
  else if ((slotIndex + endpointIndex * 17) % 149 === 0) status = "offline";
  if (endpoint.health_status === "offline" && slotIndex >= historySlots - 8) status = "offline";
  if (endpoint.health_status === "unknown" && slotIndex >= historySlots - 6) status = "unknown";

  // Keep the latest point in sync with the current endpoint card when the
  // seeded endpoint has a known online value.
  if (slotIndex === historySlots - 1 && endpoint.health_status === "online" && configuredPlayers !== null) {
    status = "online";
  }

  const players = status === "online"
    ? clamp(slotIndex === historySlots - 1 && configuredPlayers !== null ? configuredPlayers : Math.round(baseline * variation), 0, capacity)
    : null;
  const playersMax = status === "online" ? capacity : null;
  const failureCode = status === "online" ? null : status === "offline" ? "unreachable" : "monitor_error";
  const recordedAt = new Date(Math.min(now.getTime(), sampledAt.getTime() + 5_000));

  return {
    serverId: endpoint.server_id,
    edition: endpoint.edition,
    historySourceId: endpoint.history_source_id,
    sampledAt,
    recordedAt,
    status,
    failureCode,
    playersCurrent: players,
    playersMax,
    runId: `seed-history-${endpoint.server_id.slice(-4)}-${endpoint.edition}-${slotIndex}`,
  };
}

async function insertSnapshots(client, rows) {
  const batchSize = 400;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 10;
      values.push(
        row.serverId,
        row.edition,
        row.historySourceId,
        row.sampledAt,
        row.recordedAt,
        row.status,
        row.failureCode,
        row.playersCurrent,
        row.playersMax,
        row.runId,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
    });

    await client.query(
      `insert into server_endpoint_player_snapshots (
         server_id, edition, history_source_id, sampled_at, recorded_at,
         status, failure_code, players_current, players_max, run_id
       ) values ${placeholders.join(", ")}
       on conflict (server_id, edition, sampled_at) do update set
         history_source_id = excluded.history_source_id,
         recorded_at = excluded.recorded_at,
         status = excluded.status,
         failure_code = excluded.failure_code,
         players_current = excluded.players_current,
         players_max = excluded.players_max,
         run_id = excluded.run_id`,
      values,
    );
  }
}

async function rebuildHourlyRollups(client) {
  await client.query(
    `insert into server_endpoint_player_hourly (
       server_id, edition, bucket_start, last_source_id, source_changed,
       sample_count, online_count, unknown_count, player_data_count,
       players_total, players_peak, capacity_data_count, capacity_total,
       capacity_latest, occupancy_data_count, occupancy_basis_points_total,
       last_sample_at
     )
     select
       server_id,
       edition,
       date_trunc('hour', sampled_at),
       (array_agg(history_source_id order by sampled_at desc))[1],
       case when count(distinct history_source_id) > 1 then 1 else 0 end,
       count(*)::int,
       count(*) filter (where status = 'online')::int,
       count(*) filter (where status = 'unknown')::int,
       count(*) filter (where status = 'online' and players_current is not null)::int,
       coalesce(sum(players_current) filter (where status = 'online' and players_current is not null), 0)::bigint,
       max(players_current) filter (where status = 'online' and players_current is not null),
       count(*) filter (where status = 'online' and players_max is not null)::int,
       coalesce(sum(players_max) filter (where status = 'online' and players_max is not null), 0)::bigint,
       (array_agg(players_max order by sampled_at desc) filter (where status = 'online' and players_max is not null))[1],
       count(*) filter (where status = 'online' and players_current is not null and players_max is not null and players_max > 0)::int,
       coalesce(sum(round((players_current::numeric / nullif(players_max, 0)) * 10000)) filter (where status = 'online' and players_current is not null and players_max is not null and players_max > 0), 0)::bigint,
       max(sampled_at)
     from server_endpoint_player_snapshots
     where server_id = any($1::uuid[])
     group by server_id, edition, date_trunc('hour', sampled_at)
     on conflict (server_id, edition, bucket_start) do update set
       last_source_id = excluded.last_source_id,
       source_changed = excluded.source_changed,
       sample_count = excluded.sample_count,
       online_count = excluded.online_count,
       unknown_count = excluded.unknown_count,
       player_data_count = excluded.player_data_count,
       players_total = excluded.players_total,
       players_peak = excluded.players_peak,
       capacity_data_count = excluded.capacity_data_count,
       capacity_total = excluded.capacity_total,
       capacity_latest = excluded.capacity_latest,
       occupancy_data_count = excluded.occupancy_data_count,
       occupancy_basis_points_total = excluded.occupancy_basis_points_total,
       last_sample_at = excluded.last_sample_at`,
    [seedServerIds],
  );
}

async function seedPlayerHistory() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();
  const now = new Date();
  const end = alignToSlot(now);
  const start = new Date(end.getTime() - (historySlots - 1) * slotMilliseconds);

  try {
    const tables = await client.query("select to_regclass('public.server_endpoint_player_snapshots') as snapshots, to_regclass('public.server_endpoint_player_hourly') as hourly");
    if (!tables.rows[0]?.snapshots || !tables.rows[0]?.hourly) {
      throw new Error("Player history tables are missing. Run pnpm db:migrate against the local database first.");
    }

    const endpoints = await client.query(
      `select e.server_id, e.edition, e.history_source_id, e.health_status, e.players_current, e.players_max
       from server_endpoints e
       where e.server_id = any($1::uuid[])
       order by e.server_id, e.edition`,
      [seedServerIds],
    );
    if (!endpoints.rows.length) throw new Error("No seed endpoints found. Run pnpm db:seed first.");

    await client.query("begin");
    // Only replace rows generated by this fixture. Existing monitor history is
    // intentionally preserved, which makes reruns safe on a shared dev branch.
    await client.query(
      "delete from server_endpoint_player_snapshots where server_id = any($1::uuid[]) and run_id like 'seed-history-%'",
      [seedServerIds],
    );

    const rows = [];
    for (const [endpointIndex, endpoint] of endpoints.rows.entries()) {
      for (let slotIndex = 0; slotIndex < historySlots; slotIndex += 1) {
        rows.push(makeObservation(endpoint, endpointIndex, slotIndex, new Date(start.getTime() + slotIndex * slotMilliseconds), now));
      }
    }
    await insertSnapshots(client, rows);
    await rebuildHourlyRollups(client);
    await client.query("commit");

    const count = await client.query(
      `select
         (select count(*)::int from server_endpoint_player_snapshots where server_id = any($1::uuid[])) as raw_points,
         (select count(*)::int from server_endpoint_player_hourly where server_id = any($1::uuid[])) as hourly_points`,
      [seedServerIds],
    );
    console.log(`Seeded ${endpoints.rows.length} endpoints with ${count.rows[0].raw_points} raw player samples and ${count.rows[0].hourly_points} hourly rollups.`);
    console.log(`History window: ${start.toISOString()} → ${end.toISOString()}`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await seedPlayerHistory();
