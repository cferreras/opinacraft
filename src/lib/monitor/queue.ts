import { PgBoss, type SendOptions } from "pg-boss";

import { serializeUtcTimestamp } from "./contracts";

export const MONITOR_QUEUE_NAME = "monitor-checks";
export const MONITOR_BUSINESS_EVENTS_QUEUE_NAME = "monitor-business-events";
export const MONITOR_BUSINESS_EVENTS_SCHEDULE_KEY = "monitor-business-events-hourly";
export const MONITOR_SWEEPER_INTERVAL_MS = 5 * 60_000;

export type MonitorCheckJob = {
  serverId: string;
  scheduledAt: string;
  sourceVersion: string;
};

export type MonitorScheduleTarget = {
  serverId: string;
  cadenceMinutes: 15 | 60;
  sourceVersion: string;
};

export function createMonitorBoss(connectionString = process.env.MONITOR_DATABASE_URL) {
  if (!connectionString) throw new Error("MONITOR_DATABASE_URL is required for pg-boss.");
  return new PgBoss(getMonitorBossConnectionString(connectionString));
}

export function getMonitorBossConnectionString(connectionString: string, useTls = process.env.MONITOR_DATABASE_SSL === "true") {
  try {
    const url = new URL(connectionString);
    const options = url.searchParams.get("options") ?? "";
    if (!/TimeZone\s*=\s*UTC/i.test(options)) {
      url.searchParams.set("options", `${options}${options ? " " : ""}-c TimeZone=UTC`);
    }
    if (useTls) url.searchParams.set("sslmode", "require");
    return url.toString();
  } catch {
    // Keep the original connection string so pg-boss can report its normal
    // connection error for an unusual but otherwise supported DSN.
    return connectionString;
  }
}

export function getMonitorJobKey(job: Pick<MonitorCheckJob, "serverId" | "scheduledAt">) {
  return `monitor:${job.serverId}:${job.scheduledAt}`;
}

export function getNextMonitorDate(
  now: Date,
  cadenceMinutes: 15 | 60,
  random = Math.random(),
) {
  const boundedRandom = Math.max(0, Math.min(1, random));
  const jitterMs = Math.round(boundedRandom * 120_000);
  return new Date(now.getTime() + cadenceMinutes * 60_000 + jitterMs);
}

export async function sendMonitorCheck(
  boss: Pick<PgBoss, "send">,
  target: MonitorScheduleTarget,
  scheduledAt: Date,
  options: Pick<SendOptions, "retryLimit" | "retryDelay" | "retryBackoff"> = {},
) {
  const data: MonitorCheckJob = {
    serverId: target.serverId,
    scheduledAt: serializeUtcTimestamp(scheduledAt),
    sourceVersion: target.sourceVersion,
  };
  const sendOptions: SendOptions = {
    ...options,
    startAfter: scheduledAt,
    retryLimit: options.retryLimit ?? 3,
    retryDelay: options.retryDelay ?? 10,
    retryBackoff: options.retryBackoff ?? true,
    singletonKey: getMonitorJobKey(data),
    deleteAfterSeconds: 300,
  };
  return boss.send(MONITOR_QUEUE_NAME, data, sendOptions);
}

export async function scheduleMonitorBusinessEvents(
  boss: Pick<PgBoss, "schedule">,
) {
  await boss.schedule(
    MONITOR_BUSINESS_EVENTS_QUEUE_NAME,
    "0 * * * *",
    null,
    {
      key: MONITOR_BUSINESS_EVENTS_SCHEDULE_KEY,
      tz: "UTC",
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      deleteAfterSeconds: 3_600,
    },
  );
}
