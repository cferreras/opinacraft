import "dotenv/config";

import { createHash } from "node:crypto";
import pg from "pg";

import {
  assertBackfillVerification,
  buildHistorySourceQuery,
  getBackfillHistoryLockSql,
  mergeHourlyBackfillRow,
} from "./backfill-monitor-queries.mjs";

const neonUrl = process.env.DATABASE_URL?.trim();
const monitorUrl = process.env.MONITOR_DATABASE_URL?.trim();
if (!neonUrl) throw new Error("DATABASE_URL is required for the Neon backfill source.");
if (!monitorUrl) throw new Error("MONITOR_DATABASE_URL is required for the Monitor DB destination.");

const neon = new pg.Pool({ connectionString: neonUrl });
const monitor = new pg.Pool({ connectionString: monitorUrl });

async function tableExists(client, tableName) {
  const result = await client.query("select to_regclass($1) as table_name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

function cadenceMinutes(server, endpoints) {
  return server.publication_status === "published"
    && server.moderation_status === "active"
    && server.availability_hidden_at === null
    && endpoints.some((endpoint) => endpoint.verification_status === "verified")
    ? 15
    : 60;
}

function sourceVersion(server, endpoints) {
  const value = [
    new Date(server.updated_at).toISOString(),
    server.verification_status,
    ...endpoints.map((endpoint) => `${endpoint.edition}:${endpoint.host}:${endpoint.port}:${endpoint.verification_status}:${endpoint.history_source_id}`),
  ].join("|");
  return value.length <= 512 ? value : createHash("sha256").update(value).digest("hex");
}

async function migrateTargets(neonClient, monitorClient) {
  const servers = await neonClient.query(`
    select id, updated_at, publication_status, moderation_status, availability_hidden_at,
           verification_status, monitor_health_status, monitor_players_current,
           monitor_players_max, monitor_version, monitor_latency_ms,
           monitor_last_checked_at, monitor_last_online_at,
           monitor_consecutive_failures, monitor_probe_edition
    from servers
    order by id asc
  `);
  let migrated = 0;
  for (const server of servers.rows) {
    const [network, endpoints] = await Promise.all([
      neonClient.query("select host from server_network_targets where server_id = $1 limit 1", [server.id]),
      neonClient.query(`
        select edition, history_source_id, host, port, verification_status
        from server_endpoints where server_id = $1 order by case when edition = 'java' then 0 else 1 end
      `, [server.id]),
    ]);
    const networkHost = network.rows[0]?.host ?? endpoints.rows[0]?.host;
    if (!networkHost) continue;
    const cadence = cadenceMinutes(server, endpoints.rows);
    await monitorClient.query(`
      insert into monitor_targets (
        server_id, source_version, publication_status, moderation_status,
        availability_hidden_at, network_host, cadence_minutes, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (server_id) do update set
        source_version = excluded.source_version,
        publication_status = excluded.publication_status,
        moderation_status = excluded.moderation_status,
        availability_hidden_at = excluded.availability_hidden_at,
        network_host = excluded.network_host,
        cadence_minutes = excluded.cadence_minutes,
        updated_at = now()
    `, [
      server.id,
      sourceVersion(server, endpoints.rows),
      server.publication_status,
      server.moderation_status,
      server.availability_hidden_at,
      networkHost,
      cadence,
    ]);
    await monitorClient.query("delete from monitor_target_endpoints where server_id = $1", [server.id]);
    for (const endpoint of endpoints.rows) {
      await monitorClient.query(`
        insert into monitor_target_endpoints (server_id, edition, history_source_id, host, port, verification_status, updated_at)
        values ($1, $2, $3, $4, $5, $6, now())
      `, [server.id, endpoint.edition, endpoint.history_source_id, endpoint.host, endpoint.port, endpoint.verification_status]);
    }
    await monitorClient.query(`
      insert into monitor_states (
        server_id, health_status, players_current, players_max, version, latency_ms,
        last_checked_at, last_online_at, consecutive_failures, probe_edition
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (server_id) do nothing
    `, [
      server.id,
      server.monitor_health_status,
      server.monitor_players_current,
      server.monitor_players_max,
      server.monitor_version,
      server.monitor_latency_ms,
      server.monitor_last_checked_at,
      server.monitor_last_online_at,
      server.monitor_consecutive_failures,
      server.monitor_probe_edition,
    ]);
    if (endpoints.rows.some((endpoint) => endpoint.verification_status === "verified")) {
      await monitorClient.query(`
        insert into monitor_schedules (server_id, cadence_minutes, next_due_at)
        values ($1, $2, now())
        on conflict (server_id) do update set cadence_minutes = excluded.cadence_minutes, updated_at = now()
      `, [server.id, cadence]);
    } else {
      await monitorClient.query("delete from monitor_schedules where server_id = $1", [server.id]);
    }
    migrated += 1;
  }
  return migrated;
}

async function readHistory(neonClient, targetIds, tableName, selectSql) {
  if (!targetIds.length) return [];
  if (!(await tableExists(neonClient, tableName))) {
    throw new Error(`Required Neon history table ${tableName} does not exist.`);
  }
  return (await neonClient.query(selectSql, [targetIds])).rows;
}

async function insertHistory(monitorClient, rows, buildInsertSql, valuesForRow) {
  const rowValues = rows.map(valuesForRow);
  const batchSize = 500;

  for (let offset = 0; offset < rowValues.length; offset += batchSize) {
    const batch = rowValues.slice(offset, offset + batchSize);
    const columnCount = batch[0].length;
    const placeholders = batch.map((values, rowIndex) => `(${values.map((_, columnIndex) => `$${rowIndex * columnCount + columnIndex + 1}`).join(", ")})`).join(", ");
    await monitorClient.query(buildInsertSql(placeholders), batch.flat());
  }
}

function snapshotKey(row) {
  return `${row.server_id}:${new Date(row.scheduled_at).toISOString()}`;
}

function hourlyKey(row) {
  return `${row.serverId}:${new Date(row.bucketStart).toISOString()}`;
}

function toHourlyRow(row) {
  return {
    serverId: row.server_id,
    bucketStart: new Date(row.bucket_start),
    lastProbeEdition: row.last_probe_edition,
    sourceChanged: Number(row.source_changed),
    sampleCount: Number(row.sample_count),
    onlineCount: Number(row.online_count),
    unknownCount: Number(row.unknown_count),
    playerDataCount: Number(row.player_data_count),
    playersTotal: Number(row.players_total),
    playersPeak: row.players_peak === null ? null : Number(row.players_peak),
    capacityDataCount: Number(row.capacity_data_count),
    capacityTotal: Number(row.capacity_total),
    capacityLatest: row.capacity_latest === null ? null : Number(row.capacity_latest),
    occupancyDataCount: Number(row.occupancy_data_count),
    occupancyBasisPointsTotal: Number(row.occupancy_basis_points_total),
    lastObservedAt: row.last_observed_at ? new Date(row.last_observed_at) : null,
  };
}

function toBackfillSnapshot(row) {
  return {
    observedAt: new Date(row.observed_at),
    probeEdition: row.probe_edition,
    status: row.status,
    playersCurrent: row.players_current === null ? null : Number(row.players_current),
    playersMax: row.players_max === null ? null : Number(row.players_max),
  };
}

function snapshotBucketKey(row) {
  const bucketStart = new Date(row.scheduled_at);
  bucketStart.setUTCMinutes(0, 0, 0);
  return `${row.server_id}:${bucketStart.toISOString()}`;
}

function hourlyValues(row) {
  return [
    row.serverId, row.bucketStart, row.lastProbeEdition, row.sourceChanged,
    row.sampleCount, row.onlineCount, row.unknownCount, row.playerDataCount,
    row.playersTotal, row.playersPeak, row.capacityDataCount, row.capacityTotal,
    row.capacityLatest, row.occupancyDataCount, row.occupancyBasisPointsTotal,
    row.lastObservedAt,
  ];
}

function sameHourlyAggregate(left, right) {
  return JSON.stringify(hourlyValues(left).map((value) => value instanceof Date ? value.toISOString() : value))
    === JSON.stringify(hourlyValues(right).map((value) => value instanceof Date ? value.toISOString() : value));
}

async function rebuildDerivedStateHistory(monitorClient) {
  const targets = await monitorClient.query("select server_id from monitor_targets order by server_id asc");
  let transitions = 0;

  for (const target of targets.rows) {
    const serverId = target.server_id;
    const snapshots = await monitorClient.query(`
      select scheduled_at, observed_at, status
      from monitor_player_snapshots
      where server_id = $1
      order by scheduled_at asc
    `, [serverId]);

    let currentStatus = "unknown";
    let consecutiveFailures = 0;
    let offlineSince = null;
    let lastRecoveredAt = null;
    let lastStateChangeAt = null;
    const stateChanges = [];

    for (const snapshot of snapshots.rows) {
      const occurredAt = snapshot.observed_at;
      if (snapshot.status === "online") {
        if (currentStatus === "offline") {
          lastRecoveredAt = occurredAt;
          lastStateChangeAt = occurredAt;
          stateChanges.push({ from: "offline", to: "online", occurredAt, failures: 0 });
        }
        currentStatus = "online";
        consecutiveFailures = 0;
        offlineSince = null;
        continue;
      }

      if (snapshot.status === "offline") {
        consecutiveFailures += 1;
        const nextStatus = consecutiveFailures >= 3 ? "offline" : currentStatus;
        if (nextStatus === "offline" && currentStatus !== "offline") {
          offlineSince = occurredAt;
          lastStateChangeAt = occurredAt;
          stateChanges.push({ from: currentStatus, to: "offline", occurredAt, failures: consecutiveFailures });
        }
        currentStatus = nextStatus;
        continue;
      }

      currentStatus = "unknown";
    }

    await monitorClient.query("delete from monitor_state_changes where server_id = $1", [serverId]);
    for (const change of stateChanges) {
      await monitorClient.query(`
        insert into monitor_state_changes (server_id, from_status, to_status, occurred_at, consecutive_failures)
        values ($1, $2, $3, $4, $5)
      `, [serverId, change.from, change.to, change.occurredAt, change.failures]);
      transitions += 1;
    }

    const [state] = (await monitorClient.query("select health_status from monitor_states where server_id = $1", [serverId])).rows;
    if (!state) continue;
    await monitorClient.query(`
      update monitor_states set
        offline_since = $2,
        last_recovered_at = $3,
        last_state_change_at = $4
      where server_id = $1
    `, [
      serverId,
      state.health_status === "offline" ? offlineSince : null,
      lastRecoveredAt,
      lastStateChangeAt,
    ]);
  }

  return transitions;
}

async function migrate() {
  const neonClient = await neon.connect();
  const monitorClient = await monitor.connect();
  try {
    await neonClient.query("set time zone 'UTC'");
    await monitorClient.query("set time zone 'UTC'");
    await monitorClient.query("begin");

    const targets = await migrateTargets(neonClient, monitorClient);
    const targetIds = (await monitorClient.query(
      "select server_id from monitor_targets order by server_id asc",
    )).rows.map((row) => row.server_id);

    const sourceSnapshotRows = await readHistory(
      neonClient,
      targetIds,
      "server_player_snapshots",
      buildHistorySourceQuery({
        table: "server_player_snapshots",
        alias: "s",
        columns: [
          "s.server_id", "s.scheduled_at", "s.observed_at", "s.probe_edition",
          "s.status", "s.failure_code", "s.players_current", "s.players_max",
          "s.version", "s.latency_ms", "s.job_id",
        ],
        orderBy: "s.server_id, s.scheduled_at",
      }),
    );
    await insertHistory(
      monitorClient,
      sourceSnapshotRows,
      (placeholders) => `insert into monitor_player_snapshots (
        server_id, scheduled_at, observed_at, probe_edition, status, failure_code,
        players_current, players_max, version, latency_ms, job_id
      ) values ${placeholders}
      on conflict (server_id, scheduled_at) do nothing`,
      (row) => [row.server_id, row.scheduled_at, row.observed_at, row.probe_edition, row.status, row.failure_code, row.players_current, row.players_max, row.version, row.latency_ms, row.job_id],
    );

    const sourceHourlyRows = await readHistory(
      neonClient,
      targetIds,
      "server_player_hourly",
      buildHistorySourceQuery({
        table: "server_player_hourly",
        alias: "h",
        columns: [
          "h.server_id", "h.bucket_start", "h.last_probe_edition", "h.source_changed",
          "h.sample_count", "h.online_count", "h.unknown_count", "h.player_data_count",
          "h.players_total", "h.players_peak", "h.capacity_data_count", "h.capacity_total",
          "h.capacity_latest", "h.occupancy_data_count", "h.occupancy_basis_points_total",
          "h.last_observed_at",
        ],
        orderBy: "h.server_id, h.bucket_start",
      }),
    );
    await monitorClient.query(getBackfillHistoryLockSql());
    const destinationSnapshots = targetIds.length ? (await monitorClient.query(`
      select server_id, scheduled_at, observed_at, probe_edition, status, players_current, players_max
      from monitor_player_snapshots
      where server_id = any($1::uuid[])
      order by server_id, scheduled_at
    `, [targetIds])).rows : [];
    const snapshotsByBucket = new Map();
    for (const row of destinationSnapshots) {
      const key = snapshotBucketKey(row);
      const bucket = snapshotsByBucket.get(key) ?? [];
      bucket.push(toBackfillSnapshot(row));
      snapshotsByBucket.set(key, bucket);
    }
    const mergedHourlyRows = sourceHourlyRows.map((row) => {
      const source = toHourlyRow(row);
      return mergeHourlyBackfillRow(source, snapshotsByBucket.get(hourlyKey(source)) ?? []);
    });
    await insertHistory(
      monitorClient,
      mergedHourlyRows,
      (placeholders) => `insert into monitor_player_hourly (
        server_id, bucket_start, last_probe_edition, source_changed, sample_count,
        online_count, unknown_count, player_data_count, players_total, players_peak,
        capacity_data_count, capacity_total, capacity_latest, occupancy_data_count,
        occupancy_basis_points_total, last_observed_at
      ) values ${placeholders}
      on conflict (server_id, bucket_start) do update set
        last_probe_edition = excluded.last_probe_edition,
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
        last_observed_at = excluded.last_observed_at`,
      hourlyValues,
    );

    const destinationSnapshotKeys = new Set(destinationSnapshots.map(snapshotKey));
    const destinationHourlyRows = targetIds.length ? (await monitorClient.query(`
      select server_id, bucket_start, last_probe_edition, source_changed, sample_count,
             online_count, unknown_count, player_data_count, players_total, players_peak,
             capacity_data_count, capacity_total, capacity_latest, occupancy_data_count,
             occupancy_basis_points_total, last_observed_at
      from monitor_player_hourly
      where server_id = any($1::uuid[])
      order by server_id, bucket_start
    `, [targetIds])).rows.map(toHourlyRow) : [];
    const destinationHourlyByKey = new Map(destinationHourlyRows.map((row) => [hourlyKey(row), row]));
    const verification = assertBackfillVerification({
      targets,
      sourceSnapshots: sourceSnapshotRows.length,
      missingSnapshots: sourceSnapshotRows.filter((row) => !destinationSnapshotKeys.has(snapshotKey(row))).length,
      sourceHourly: sourceHourlyRows.length,
      missingHourly: mergedHourlyRows.filter((row) => !destinationHourlyByKey.has(hourlyKey(row))).length,
      mismatchedHourly: mergedHourlyRows.filter((row) => {
        const destination = destinationHourlyByKey.get(hourlyKey(row));
        return destination ? !sameHourlyAggregate(row, destination) : false;
      }).length,
    });

    const stateChanges = await rebuildDerivedStateHistory(monitorClient);

    await monitorClient.query("commit");
    console.log(JSON.stringify({ ok: true, ...verification, stateChanges }));
  } catch (error) {
    await monitorClient.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    neonClient.release();
    monitorClient.release();
  }
}

try {
  await migrate();
} finally {
  await Promise.all([neon.end(), monitor.end()]);
}
