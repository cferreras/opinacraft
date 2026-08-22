import "dotenv/config";

import { createServer } from "node:http";

import { closeMonitorDatabase } from "@/lib/monitor/db";
import { getDueMonitorSchedules, getMonitorTarget, markMonitorScheduleScheduled, persistMonitorObservation } from "@/lib/monitor/repository";
import { createMonitorBoss, MONITOR_QUEUE_NAME, MONITOR_SWEEPER_INTERVAL_MS, sendMonitorCheck } from "@/lib/monitor/queue";
import { recoverDueMonitorSchedules } from "@/lib/monitor/sweeper";
import { processMonitorCheckJob } from "@/lib/monitor/worker-engine";
import { createMonitorHealthHandler, type MonitorHealthSnapshot } from "./monitor-worker-health";
import { numberEnv } from "./monitor-worker-config";
import { describeMonitorError } from "./monitor-worker-errors";
import { probeCanonicalEndpoint } from "./monitor-worker-probe";

type WorkerConfig = {
  workerId: string;
  probeConcurrency: number;
  healthPort: number;
  sweeperIntervalMs: number;
};

function getConfig(): WorkerConfig {
  if (!process.env.MONITOR_DATABASE_URL) throw new Error("MONITOR_DATABASE_URL is required for the monitor worker.");
  const workerId = process.env.MONITOR_WORKER_ID?.trim();
  if (!workerId) throw new Error("MONITOR_WORKER_ID is required for the monitor worker.");
  return {
    workerId,
    probeConcurrency: numberEnv("MONITOR_PROBE_CONCURRENCY", 10, 1),
    healthPort: numberEnv("MONITOR_HEALTH_PORT", 3_001, 1),
    sweeperIntervalMs: numberEnv("MONITOR_SWEEPER_INTERVAL_MS", MONITOR_SWEEPER_INTERVAL_MS, 30_000),
  };
}

export async function startMonitorWorker() {
  const config = getConfig();
  const boss = createMonitorBoss();
  await boss.start();
  await boss.createQueue(MONITOR_QUEUE_NAME, { notify: true, retryLimit: 3, retryDelay: 10, retryBackoff: true });

  let stopping = false;
  let lastHeartbeatAt = 0;
  let queueAgeSeconds: number | null = null;
  const getSnapshot = (): MonitorHealthSnapshot => ({
    workerId: config.workerId,
    healthy: lastHeartbeatAt > 0 && Date.now() - lastHeartbeatAt <= config.sweeperIntervalMs * 2,
    queueAgeSeconds,
  });
  const healthHandler = createMonitorHealthHandler(getSnapshot);
  const httpServer = createServer(async (request, response) => {
    if (request.method === "GET" && request.url?.split("?", 1)[0] === "/healthz") {
      const health = await healthHandler(new Request("http://127.0.0.1/healthz"));
      response.statusCode = health.status;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(await health.text());
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.healthPort, "0.0.0.0", resolve);
  });

  const schedule = async (target: Awaited<ReturnType<typeof getMonitorTarget>>, scheduledAt: Date) => {
    if (!target) return;
    await sendMonitorCheck(boss, target, scheduledAt);
    await markMonitorScheduleScheduled(target.serverId, scheduledAt, scheduledAt);
  };

  await boss.work<import("@/lib/monitor/queue").MonitorCheckJob>(MONITOR_QUEUE_NAME, {
    localConcurrency: config.probeConcurrency,
    batchSize: 1,
    pollingIntervalSeconds: 1,
  }, async ([job]) => {
    const result = await processMonitorCheckJob({
      job: job.data,
      getTarget: getMonitorTarget,
      probe: probeCanonicalEndpoint,
      persist: async (observation) => { await persistMonitorObservation(observation, job.id); },
      schedule,
    });
    lastHeartbeatAt = Date.now();
    return result;
  });

  const sweep = async () => {
    if (stopping) return;
    try {
      const now = new Date();
      const schedules = await getDueMonitorSchedules(now, config.probeConcurrency * 4);
      queueAgeSeconds = schedules.length ? Math.max(0, Math.round((now.getTime() - schedules[0]!.nextDueAt.getTime()) / 1000)) : null;
      await recoverDueMonitorSchedules(schedules, {
        send: (target, scheduledAt) => sendMonitorCheck(boss, target, scheduledAt),
        markScheduled: markMonitorScheduleScheduled,
      });
      lastHeartbeatAt = Date.now();
    } catch (error) {
      console.error("[monitor-worker] sweeper failed", describeMonitorError(error));
    }
  };
  await sweep();
  const timer = setInterval(() => { void sweep(); }, config.sweeperIntervalMs);
  timer.unref();

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await boss.stop();
    await closeMonitorDatabase();
  };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
  await new Promise<void>(() => undefined);
}

void startMonitorWorker().catch((error) => {
  console.error("[monitor-worker] startup failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
