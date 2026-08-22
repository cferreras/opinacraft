export function buildHistorySourceQuery({ table, alias, columns, orderBy }) {
  return [
    `select ${columns.join(", ")}`,
    `from ${table} ${alias}`,
    `where ${alias}.server_id = any($1::uuid[])`,
    `order by ${orderBy}`,
  ].join(" ");
}

export function getBackfillHistoryLockSql() {
  return "lock table monitor_player_snapshots, monitor_player_hourly in share row exclusive mode";
}

function validPlayerValue(snapshot) {
  return snapshot.status === "online" && Number.isInteger(snapshot.playersCurrent) && snapshot.playersCurrent >= 0;
}

function validCapacityValue(snapshot) {
  return snapshot.status === "online" && Number.isInteger(snapshot.playersMax) && snapshot.playersMax > 0;
}

export function mergeHourlyBackfillRow(source, snapshots) {
  const result = { ...source };
  const sourceLastObservedAt = source.lastObservedAt ? new Date(source.lastObservedAt) : null;
  const newerSnapshots = snapshots
    .filter((snapshot) => !sourceLastObservedAt || new Date(snapshot.observedAt) > sourceLastObservedAt)
    .sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt));

  for (const snapshot of newerSnapshots) {
    const hasPlayers = validPlayerValue(snapshot);
    const hasCapacity = validCapacityValue(snapshot);
    const hasOccupancy = hasPlayers && hasCapacity;
    const previousEdition = result.lastProbeEdition;

    result.sampleCount += 1;
    result.onlineCount += snapshot.status === "online" ? 1 : 0;
    result.unknownCount += snapshot.status === "unknown" ? 1 : 0;
    result.playerDataCount += hasPlayers ? 1 : 0;
    result.playersTotal += hasPlayers ? snapshot.playersCurrent : 0;
    result.playersPeak = hasPlayers ? Math.max(result.playersPeak ?? snapshot.playersCurrent, snapshot.playersCurrent) : result.playersPeak;
    result.capacityDataCount += hasCapacity ? 1 : 0;
    result.capacityTotal += hasCapacity ? snapshot.playersMax : 0;
    if (hasCapacity) result.capacityLatest = snapshot.playersMax;
    result.occupancyDataCount += hasOccupancy ? 1 : 0;
    result.occupancyBasisPointsTotal += hasOccupancy ? Math.round((snapshot.playersCurrent / snapshot.playersMax) * 10_000) : 0;
    result.sourceChanged = result.sourceChanged || (previousEdition && snapshot.probeEdition && previousEdition !== snapshot.probeEdition) ? 1 : 0;
    result.lastProbeEdition = snapshot.probeEdition ?? result.lastProbeEdition;
    result.lastObservedAt = new Date(snapshot.observedAt);
  }

  return result;
}

export function assertBackfillVerification(summary) {
  if (summary.missingSnapshots > 0) {
    throw new Error(`Backfill verification failed: missing ${summary.missingSnapshots} snapshot rows.`);
  }
  if (summary.missingHourly > 0) {
    throw new Error(`Backfill verification failed: missing ${summary.missingHourly} hourly rows.`);
  }
  if (summary.mismatchedHourly > 0) {
    throw new Error(`Backfill verification failed: mismatched ${summary.mismatchedHourly} hourly rows.`);
  }
  return summary;
}
