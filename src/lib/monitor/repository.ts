import { getMonitorFreshness, type MonitorFreshness } from "@/lib/servers/monitor-scheduling";
import { orderMonitorCandidates, type MonitorCandidate } from "@/lib/servers/catalog-monitor";
import type { CanonicalMonitorObservation } from "@/lib/servers/monitor-worker-core";
import { serializeUtcTimestamp } from "./contracts";
import { withMonitorClient, withMonitorTransaction } from "./db";
import type { PendingMonitorEvent } from "./events";

export type MonitorTarget = {
  serverId: string;
  sourceVersion: string;
  publicationStatus: "draft" | "published" | "hidden";
  moderationStatus: "active" | "blocked";
  availabilityHiddenAt: Date | null;
  networkHost: string;
  cadenceMinutes: 15 | 60;
  endpoints: Array<{
    edition: "java" | "bedrock";
    historySourceId: string;
    host: string;
    port: number;
    verificationStatus: "unverified" | "verified";
  }>;
};

export type MonitorStatusView = {
  serverId: string;
  healthStatus: "unknown" | "online" | "offline";
  playersCurrent: number | null;
  playersMax: number | null;
  version: string | null;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  lastOnlineAt: string | null;
  offlineSince: string | null;
  lastRecoveredAt: string | null;
  lastStateChangeAt: string | null;
  consecutiveFailures: number;
  probeEdition: "java" | "bedrock" | null;
  cadenceMinutes: 15 | 60 | null;
  freshness: MonitorFreshness;
};

function asUtc(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? serializeUtcTimestamp(value) : new Date(value).toISOString();
}

function mapTargetRows(rows: Array<Record<string, unknown>>): MonitorTarget | null {
  const first = rows[0];
  if (!first) return null;
  return {
    serverId: String(first.server_id),
    sourceVersion: String(first.source_version),
    publicationStatus: first.publication_status as MonitorTarget["publicationStatus"],
    moderationStatus: first.moderation_status as MonitorTarget["moderationStatus"],
    availabilityHiddenAt: first.availability_hidden_at as Date | null,
    networkHost: String(first.network_host),
    cadenceMinutes: Number(first.cadence_minutes) as 15 | 60,
    endpoints: rows.flatMap((row) => row.edition ? [{
      edition: row.edition as "java" | "bedrock",
      historySourceId: String(row.history_source_id),
      host: String(row.endpoint_host),
      port: Number(row.port),
      verificationStatus: row.verification_status as "unverified" | "verified",
    }] : []),
  };
}

export async function upsertMonitorTarget(target: MonitorTarget) {
  return withMonitorTransaction(async (client) => {
    await client.query(`
      insert into monitor_targets (server_id, source_version, publication_status, moderation_status, availability_hidden_at, network_host, cadence_minutes, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (server_id) do update set
        source_version = excluded.source_version,
        publication_status = excluded.publication_status,
        moderation_status = excluded.moderation_status,
        availability_hidden_at = excluded.availability_hidden_at,
        network_host = excluded.network_host,
        cadence_minutes = excluded.cadence_minutes,
        updated_at = now()
    `, [
      target.serverId,
      target.sourceVersion,
      target.publicationStatus,
      target.moderationStatus,
      target.availabilityHiddenAt,
      target.networkHost,
      target.cadenceMinutes,
    ]);

    await client.query("delete from monitor_target_endpoints where server_id = $1", [target.serverId]);
    for (const endpoint of target.endpoints) {
      await client.query(`
        insert into monitor_target_endpoints (server_id, edition, history_source_id, host, port, verification_status, updated_at)
        values ($1, $2, $3, $4, $5, $6, now())
      `, [target.serverId, endpoint.edition, endpoint.historySourceId, endpoint.host, endpoint.port, endpoint.verificationStatus]);
    }
    await client.query(`
      insert into monitor_states (server_id) values ($1)
      on conflict (server_id) do nothing
    `, [target.serverId]);
    if (target.endpoints.some((endpoint) => endpoint.verificationStatus === "verified")) {
      await client.query(`
        insert into monitor_schedules (server_id, cadence_minutes, next_due_at)
        values ($1, $2, now())
        on conflict (server_id) do update set cadence_minutes = excluded.cadence_minutes, updated_at = now()
      `, [target.serverId, target.cadenceMinutes]);
    } else {
      await client.query("delete from monitor_schedules where server_id = $1", [target.serverId]);
    }
  });
}

export async function deleteMonitorTarget(serverId: string) {
  await withMonitorClient((client) => client.query("delete from monitor_targets where server_id = $1", [serverId]));
}

export async function getMonitorTarget(serverId: string) {
  const result = await withMonitorClient((client) => client.query(`
    select t.server_id, t.source_version, t.publication_status, t.moderation_status, t.availability_hidden_at, t.network_host, t.cadence_minutes,
           e.edition, e.history_source_id, e.host as endpoint_host, e.port, e.verification_status
    from monitor_targets t
    left join monitor_target_endpoints e on e.server_id = t.server_id
    where t.server_id = $1
    order by case when e.edition = 'java' then 0 else 1 end
  `, [serverId]));
  return mapTargetRows(result.rows as Array<Record<string, unknown>>);
}

export async function listMonitorTargetIds() {
  const result = await withMonitorClient((client) => client.query("select server_id from monitor_targets order by server_id asc"));
  return result.rows.map((row) => String(row.server_id));
}

export async function getDueMonitorSchedules(now = new Date(), limit = 100) {
  const result = await withMonitorClient((client) => client.query(`
    select s.server_id, s.cadence_minutes, t.source_version, s.next_due_at
    from monitor_schedules s
    inner join monitor_targets t on t.server_id = s.server_id
    where s.next_due_at <= $1
      and exists (select 1 from monitor_target_endpoints e where e.server_id = s.server_id and e.verification_status = 'verified')
    order by s.next_due_at asc, s.server_id asc
    limit $2
  `, [now, limit]));
  return result.rows.map((row) => ({
    serverId: String(row.server_id),
    cadenceMinutes: Number(row.cadence_minutes) as 15 | 60,
    sourceVersion: String(row.source_version),
    nextDueAt: row.next_due_at as Date,
  }));
}

export async function markMonitorScheduleScheduled(serverId: string, scheduledAt: Date, nextDueAt: Date) {
  await withMonitorClient((client) => client.query(`
    update monitor_schedules
    set last_scheduled_at = $2, next_due_at = $3, updated_at = now()
    where server_id = $1
  `, [serverId, scheduledAt, nextDueAt]));
}

function getHourlyBucket(date: Date) {
  const bucket = new Date(date);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}

function hasPlayerValue(observation: CanonicalMonitorObservation) {
  return observation.status === "online" && Number.isInteger(observation.playersCurrent) && (observation.playersCurrent ?? 0) >= 0;
}

function hasCapacityValue(observation: CanonicalMonitorObservation) {
  return hasPlayerValue(observation) && Number.isInteger(observation.playersMax) && (observation.playersMax ?? 0) >= 0;
}

function occupancyBasisPoints(observation: CanonicalMonitorObservation) {
  if (!hasCapacityValue(observation) || (observation.playersMax ?? 0) <= 0) return null;
  return Math.max(0, Math.min(10_000, Math.round(((observation.playersCurrent ?? 0) / (observation.playersMax ?? 1)) * 10_000)));
}

export async function persistMonitorObservation(observation: CanonicalMonitorObservation, jobId?: string) {
  return withMonitorTransaction(async (client) => {
    const currentResult = await client.query(`
      select health_status, consecutive_failures, offline_since, last_recovered_at, last_state_change_at
      from monitor_states where server_id = $1 for update
    `, [observation.serverId]);
    const current = currentResult.rows[0];
    if (!current) throw new Error("Monitor target state not found.");

    const snapshot = await client.query(`
      insert into monitor_player_snapshots (server_id, scheduled_at, observed_at, probe_edition, status, failure_code, players_current, players_max, version, latency_ms, job_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict (server_id, scheduled_at) do nothing
      returning server_id
    `, [
      observation.serverId,
      observation.scheduledAt,
      observation.observedAt,
      observation.probeEdition,
      observation.status,
      observation.failureCode ?? null,
      hasPlayerValue(observation) ? observation.playersCurrent : null,
      hasCapacityValue(observation) ? observation.playersMax : null,
      observation.version,
      observation.latencyMs,
      jobId ?? null,
    ]);
    if (snapshot.rowCount === 0) return { persisted: false, duplicate: true, transition: null as "down" | "recovered" | null };

    const currentStatus = String(current.health_status) as "unknown" | "online" | "offline";
    const currentFailures = Number(current.consecutive_failures);
    let nextStatus = currentStatus;
    let nextFailures = currentFailures;
    let transition: "down" | "recovered" | null = null;
    let offlineSince = current.offline_since as Date | null;
    let lastRecoveredAt = current.last_recovered_at as Date | null;
    let lastStateChangeAt = current.last_state_change_at as Date | null;

    if (observation.status === "online") {
      nextStatus = "online";
      nextFailures = 0;
      if (currentStatus === "offline") {
        transition = "recovered";
        lastRecoveredAt = observation.observedAt;
      }
      offlineSince = null;
    } else if (observation.status === "offline") {
      nextFailures = currentFailures + 1;
      nextStatus = nextFailures >= 3 ? "offline" : currentStatus;
      if (nextStatus === "offline" && currentStatus !== "offline") {
        transition = "down";
        offlineSince = observation.observedAt;
      }
    } else {
      nextStatus = "unknown";
    }

    if (nextStatus !== currentStatus) lastStateChangeAt = observation.observedAt;
    await client.query(`
      update monitor_states set
        health_status = $2,
        players_current = $3,
        players_max = $4,
        version = $5,
        latency_ms = $6,
        last_checked_at = $7,
        last_online_at = case when $2 = 'online' then $7 else last_online_at end,
        offline_since = $8,
        last_recovered_at = $9,
        last_state_change_at = $10,
        consecutive_failures = $11,
        probe_edition = $12,
        updated_at = now()
      where server_id = $1
    `, [
      observation.serverId,
      nextStatus,
      hasPlayerValue(observation) ? observation.playersCurrent : null,
      hasCapacityValue(observation) ? observation.playersMax : null,
      observation.status === "online" ? observation.version : null,
      observation.status === "online" ? observation.latencyMs : null,
      observation.observedAt,
      offlineSince,
      lastRecoveredAt,
      lastStateChangeAt,
      nextFailures,
      observation.probeEdition,
    ]);

    if (nextStatus !== currentStatus) {
      await client.query(`
        insert into monitor_state_changes (server_id, from_status, to_status, occurred_at, consecutive_failures)
        values ($1, $2, $3, $4, $5)
      `, [observation.serverId, currentStatus, nextStatus, observation.observedAt, nextFailures]);
    }

    if (transition) {
      await client.query(`
        insert into monitor_business_events (dedupe_key, event_type, server_id, occurred_at, payload)
        values ($1, $2, $3, $4, $5::jsonb)
        on conflict (dedupe_key) do nothing
      `, [
        `monitor:${observation.serverId}:${transition}:${serializeUtcTimestamp(observation.observedAt)}`,
        transition === "down" ? "server.down" : "server.recovered",
        observation.serverId,
        observation.observedAt,
        JSON.stringify({ edition: observation.probeEdition, transition }),
      ]);
    }

    if (nextStatus === "offline" && offlineSince && observation.observedAt.getTime() - offlineSince.getTime() >= 7 * 24 * 60 * 60_000) {
      await client.query(`
        insert into monitor_business_events (dedupe_key, event_type, server_id, occurred_at, payload)
        values ($1, 'server.auto_hide', $2, $3, $4::jsonb)
        on conflict (dedupe_key) do nothing
      `, [
        `monitor:${observation.serverId}:auto-hide:${serializeUtcTimestamp(offlineSince)}`,
        observation.serverId,
        observation.observedAt,
        JSON.stringify({ offlineSince: serializeUtcTimestamp(offlineSince) }),
      ]);
    }

    const playersCurrent = hasPlayerValue(observation) ? observation.playersCurrent : null;
    const playersMax = hasCapacityValue(observation) ? observation.playersMax : null;
    const occupancy = occupancyBasisPoints(observation);
    const bucketStart = getHourlyBucket(observation.scheduledAt);
    await client.query(`
      insert into monitor_player_hourly (
        server_id, bucket_start, last_probe_edition, source_changed, sample_count, online_count, unknown_count,
        player_data_count, players_total, players_peak, capacity_data_count, capacity_total, capacity_latest,
        occupancy_data_count, occupancy_basis_points_total, last_observed_at
      ) values ($1, $2, $3, 0, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (server_id, bucket_start) do update set
        source_changed = case when monitor_player_hourly.last_probe_edition is not null and monitor_player_hourly.last_probe_edition <> excluded.last_probe_edition then 1 else monitor_player_hourly.source_changed end,
        last_probe_edition = excluded.last_probe_edition,
        sample_count = monitor_player_hourly.sample_count + 1,
        online_count = monitor_player_hourly.online_count + excluded.online_count,
        unknown_count = monitor_player_hourly.unknown_count + excluded.unknown_count,
        player_data_count = monitor_player_hourly.player_data_count + excluded.player_data_count,
        players_total = monitor_player_hourly.players_total + excluded.players_total,
        players_peak = greatest(coalesce(monitor_player_hourly.players_peak, 0), coalesce(excluded.players_peak, 0)),
        capacity_data_count = monitor_player_hourly.capacity_data_count + excluded.capacity_data_count,
        capacity_total = monitor_player_hourly.capacity_total + excluded.capacity_total,
        capacity_latest = coalesce(excluded.capacity_latest, monitor_player_hourly.capacity_latest),
        occupancy_data_count = monitor_player_hourly.occupancy_data_count + excluded.occupancy_data_count,
        occupancy_basis_points_total = monitor_player_hourly.occupancy_basis_points_total + excluded.occupancy_basis_points_total,
        last_observed_at = greatest(coalesce(monitor_player_hourly.last_observed_at, excluded.last_observed_at), excluded.last_observed_at)
    `, [
      observation.serverId,
      bucketStart,
      observation.probeEdition,
      observation.status === "online" ? 1 : 0,
      observation.status === "unknown" ? 1 : 0,
      playersCurrent === null ? 0 : 1,
      playersCurrent ?? 0,
      playersCurrent,
      playersMax === null ? 0 : 1,
      playersMax ?? 0,
      playersMax,
      occupancy === null ? 0 : 1,
      occupancy ?? 0,
      observation.observedAt,
    ]);

    return { persisted: true, duplicate: false, transition };
  });
}

export async function getMonitorStatuses(serverIds: readonly string[], now = new Date()) {
  if (serverIds.length === 0) return [];
  const result = await withMonitorClient((client) => client.query(`
    select t.server_id, t.cadence_minutes, s.health_status, s.players_current, s.players_max, s.version, s.latency_ms,
           s.last_checked_at, s.last_online_at, s.offline_since, s.last_recovered_at, s.last_state_change_at,
           s.consecutive_failures, s.probe_edition
    from monitor_targets t
    left join monitor_states s on s.server_id = t.server_id
    where t.server_id = any($1::uuid[])
  `, [serverIds]));
  return result.rows.map((row): MonitorStatusView => {
    const cadenceMinutes = row.cadence_minutes ? Number(row.cadence_minutes) as 15 | 60 : null;
    const lastCheckedAt = row.last_checked_at as Date | null;
    const freshness = cadenceMinutes ? getMonitorFreshness(lastCheckedAt, cadenceMinutes, now) : "never";
    return {
      serverId: String(row.server_id),
      healthStatus: freshness === "fresh" ? (row.health_status ?? "unknown") : "unknown",
      playersCurrent: freshness === "fresh" ? row.players_current ?? null : null,
      playersMax: freshness === "fresh" ? row.players_max ?? null : null,
      version: freshness === "fresh" ? row.version ?? null : null,
      latencyMs: freshness === "fresh" ? row.latency_ms ?? null : null,
      lastCheckedAt: asUtc(lastCheckedAt),
      lastOnlineAt: asUtc(row.last_online_at as Date | null),
      offlineSince: asUtc(row.offline_since as Date | null),
      lastRecoveredAt: asUtc(row.last_recovered_at as Date | null),
      lastStateChangeAt: asUtc(row.last_state_change_at as Date | null),
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      probeEdition: row.probe_edition ?? null,
      cadenceMinutes,
      freshness,
    };
  });
}

export async function queryMonitorCatalog(
  candidateIds: readonly string[],
  query: { status?: "online" | "offline" | "unknown"; sort: "catalog" | "players" | "availability" | "checkedAt" | "latency" | "version"; direction: "asc" | "desc"; page: number; pageSize: number },
  now = new Date(),
) {
  const statuses = await getMonitorStatuses(candidateIds, now);
  const statusById = new Map(statuses.map((status) => [status.serverId, status]));
  const candidates: MonitorCandidate[] = candidateIds.map((id) => {
    const status = statusById.get(id);
    return {
      id,
      status: status?.healthStatus ?? "unknown",
      players: status?.playersCurrent ?? null,
      latency: status?.latencyMs ?? null,
      version: status?.version ?? null,
      checkedAt: status?.lastCheckedAt ?? null,
    };
  });
  const ordered = orderMonitorCandidates(candidates, query);
  const selected = new Set(ordered.ids);
  return {
    ids: ordered.ids,
    totalCount: ordered.totalCount,
    states: candidateIds.filter((id) => selected.has(id)).flatMap((id) => statusById.get(id) ? [statusById.get(id)!] : []),
  };
}

export async function claimMonitorEvents(workerId: string, limit = 100, now = new Date(), leaseMs = 15 * 60_000) {
  const result = await withMonitorTransaction((client) => client.query(`
    with candidates as (
      select id from monitor_business_events
      where (status = 'pending' or (status = 'processing' and lease_until <= $1))
      order by occurred_at asc, id asc
      limit $2
      for update skip locked
    )
    update monitor_business_events e
    set status = 'processing', attempts = e.attempts + 1, lease_owner = $3, lease_until = $4, last_error = null
    from candidates c where c.id = e.id
    returning e.id, e.event_type, e.server_id, e.occurred_at, e.payload
  `, [now, limit, workerId, new Date(now.getTime() + leaseMs)]));
  return result.rows.map((row): PendingMonitorEvent => ({
    id: String(row.id),
    type: String(row.event_type),
    serverId: String(row.server_id),
    occurredAt: serializeUtcTimestamp(row.occurred_at as Date),
    payload: (row.payload ?? {}) as Record<string, unknown>,
  }));
}

export async function getPendingMonitorEvents(limit = 100, now = new Date()) {
  const result = await withMonitorClient((client) => client.query(`
    select id, event_type, server_id, occurred_at, payload
    from monitor_business_events
    where status = 'pending' or (status = 'processing' and lease_until <= $1)
    order by occurred_at asc, id asc
    limit $2
  `, [now, Math.min(Math.max(limit, 1), 500)]));
  return result.rows.map((row): PendingMonitorEvent => ({
    id: String(row.id),
    type: String(row.event_type),
    serverId: String(row.server_id),
    occurredAt: serializeUtcTimestamp(row.occurred_at as Date),
    payload: (row.payload ?? {}) as Record<string, unknown>,
  }));
}

export async function ackMonitorEvent(eventId: string, workerId: string) {
  await withMonitorClient((client) => client.query(`
    update monitor_business_events set status = 'acked', lease_owner = null, lease_until = null, processed_at = now()
    where id = $1 and status = 'processing' and lease_owner = $2
  `, [eventId, workerId]));
}

export async function failMonitorEvent(eventId: string, workerId: string, error: unknown) {
  await withMonitorClient((client) => client.query(`
    update monitor_business_events set status = 'pending', lease_owner = null, lease_until = null, last_error = $3
    where id = $1 and status = 'processing' and lease_owner = $2
  `, [eventId, workerId, error instanceof Error ? error.message.slice(0, 500) : "Monitor business event failed."]));
}

export async function getMonitorHistoryRows(serverId: string, start: Date, end: Date, raw: boolean) {
  return withMonitorClient(async (client) => {
    if (raw) {
      const result = await client.query(`
        select scheduled_at, observed_at, probe_edition, status, players_current, players_max
        from monitor_player_snapshots where server_id = $1 and scheduled_at between $2 and $3 order by scheduled_at asc
      `, [serverId, start, end]);
      return { raw: true as const, rows: result.rows };
    }
    const result = await client.query(`
      select bucket_start, last_probe_edition, source_changed, sample_count, online_count, unknown_count,
             player_data_count, players_total, players_peak, capacity_data_count, capacity_total, capacity_latest,
             occupancy_data_count, occupancy_basis_points_total, last_observed_at
      from monitor_player_hourly where server_id = $1 and bucket_start between $2 and $3 order by bucket_start asc
    `, [serverId, start, end]);
    return { raw: false as const, rows: result.rows };
  });
}

export function serializeMonitorStatus(status: MonitorStatusView) {
  return {
    ...status,
    lastCheckedAt: status.lastCheckedAt ? serializeUtcTimestamp(new Date(status.lastCheckedAt)) : null,
    lastOnlineAt: status.lastOnlineAt ? serializeUtcTimestamp(new Date(status.lastOnlineAt)) : null,
    offlineSince: status.offlineSince ? serializeUtcTimestamp(new Date(status.offlineSince)) : null,
    lastRecoveredAt: status.lastRecoveredAt ? serializeUtcTimestamp(new Date(status.lastRecoveredAt)) : null,
    lastStateChangeAt: status.lastStateChangeAt ? serializeUtcTimestamp(new Date(status.lastStateChangeAt)) : null,
  };
}
