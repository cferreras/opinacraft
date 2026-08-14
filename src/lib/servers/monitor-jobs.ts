import { getMonitorRetryDelayMs } from "./monitor-scheduling";

export type MonitorJobRetry = {
  status: "pending" | "failed";
  nextAttemptAt: Date | null;
};

export function getMonitorScheduleSlot(cadenceMinutes: number, date = new Date()) {
  const cadenceMs = cadenceMinutes * 60_000;
  return new Date(Math.floor(date.getTime() / cadenceMs) * cadenceMs);
}

export function getMonitorJobRetry(attempt: number, now = new Date()): MonitorJobRetry {
  const delayMs = getMonitorRetryDelayMs(attempt);
  if (delayMs === null) return { status: "failed", nextAttemptAt: null };
  return { status: "pending", nextAttemptAt: new Date(now.getTime() + delayMs) };
}
