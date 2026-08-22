import type { MonitorScheduleTarget } from "./queue";

export type DueMonitorSchedule = MonitorScheduleTarget & {
  nextDueAt: Date;
};

export type MonitorScheduleRecoveryDependencies = {
  send: (target: MonitorScheduleTarget, scheduledAt: Date) => Promise<unknown>;
  markScheduled: (serverId: string, scheduledAt: Date, nextDueAt: Date) => Promise<void>;
};

/**
 * Requeues the same due slot so pg-boss's singleton key can deduplicate a
 * pending or in-flight recovery. The worker will advance nextDueAt after the
 * check completes successfully.
 */
export async function recoverDueMonitorSchedules(
  schedules: readonly DueMonitorSchedule[],
  dependencies: MonitorScheduleRecoveryDependencies,
) {
  await Promise.all(schedules.map(async (schedule) => {
    const scheduledAt = schedule.nextDueAt;
    const target: MonitorScheduleTarget = {
      serverId: schedule.serverId,
      cadenceMinutes: schedule.cadenceMinutes,
      sourceVersion: schedule.sourceVersion,
    };
    await dependencies.send(target, scheduledAt);
    await dependencies.markScheduled(schedule.serverId, scheduledAt, scheduledAt);
  }));
}
