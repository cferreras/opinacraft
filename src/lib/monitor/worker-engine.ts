import { runCanonicalMonitorJob } from "@/lib/servers/monitor-worker-core";
import { getNextMonitorDate, type MonitorCheckJob } from "./queue";
import type { MonitorTarget } from "./repository";

export type MonitorWorkerEngineDependencies = {
  job: MonitorCheckJob;
  getTarget: (serverId: string) => Promise<MonitorTarget | null>;
  probe: Parameters<typeof runCanonicalMonitorJob>[0]["probe"];
  persist: Parameters<typeof runCanonicalMonitorJob>[0]["persist"];
  schedule: (target: MonitorTarget, scheduledAt: Date) => Promise<void>;
  now?: Date;
};

export async function processMonitorCheckJob({
  job,
  getTarget,
  probe,
  persist,
  schedule,
  now = new Date(),
}: MonitorWorkerEngineDependencies) {
  const target = await getTarget(job.serverId);
  if (!target) return { status: "missing" as const };

  if (target.sourceVersion !== job.sourceVersion) {
    await schedule(target, now);
    return { status: "stale" as const };
  }

  const observation = await runCanonicalMonitorJob({
    serverId: job.serverId,
    scheduledAt: new Date(job.scheduledAt),
    endpoints: target.endpoints,
    probe,
    persist,
  });
  await schedule(target, getNextMonitorDate(now, target.cadenceMinutes));
  return { status: "processed" as const, observation };
}
