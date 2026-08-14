import "dotenv/config";

import { createServer } from "node:http";

import { closeDatabase, db } from "@/db";
import { applyCanonicalObservation, markMonitorJobDone, pruneCanonicalPlayerHistory, updateCanonicalAvailability } from "@/lib/servers/monitor-canonical-persistence";
import { runCanonicalMonitorJob } from "@/lib/servers/monitor-worker-core";
import { claimMonitorJobs, enqueueDueMonitorJobs, failMonitorJob, type ClaimedMonitorJob } from "@/lib/servers/monitor-queue";
import { createMonitorHealthHandler, type MonitorHealthSnapshot } from "./monitor-worker-health";
import { numberEnv } from "./monitor-worker-config";
import { probeCanonicalEndpoint } from "./monitor-worker-probe";

type WorkerConfig = {
  workerId: string;
  pollIntervalMs: number;
  batchSize: number;
  probeConcurrency: number;
  healthPort: number;
};

function getConfig(): WorkerConfig {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the monitor worker.");
  const workerId = process.env.MONITOR_WORKER_ID?.trim();
  if (!workerId) throw new Error("MONITOR_WORKER_ID is required for the monitor worker.");
  return {
    workerId,
    pollIntervalMs: numberEnv("MONITOR_POLL_INTERVAL_MS", 10_000, 1_000),
    batchSize: numberEnv("MONITOR_BATCH_SIZE", 50, 1),
    probeConcurrency: numberEnv("MONITOR_PROBE_CONCURRENCY", 10, 1),
    healthPort: numberEnv("MONITOR_HEALTH_PORT", 3_001, 1),
  };
}

async function runOptionalMaintenance() {
  if (process.env.MONITOR_MAINTENANCE_ENABLED !== "true") return;

  const [{ runNotificationOutbox }, { runMediaCleanup }] = await Promise.all([
    import("@/lib/notifications"),
    import("@/lib/media/cleanup"),
  ]);
  await runNotificationOutbox().catch((error) => console.error("[monitor-worker] notification outbox failed", error instanceof Error ? error.name : "unknown"));
  await runMediaCleanup().catch((error) => console.error("[monitor-worker] media cleanup failed", error instanceof Error ? error.name : "unknown"));
}

async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await task(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
}

async function processJob(job: ClaimedMonitorJob, workerId: string) {
  try {
    const observation = await runCanonicalMonitorJob({
      serverId: job.serverId,
      scheduledAt: job.scheduledAt,
      endpoints: job.endpoints,
      probe: probeCanonicalEndpoint,
      persist: async (nextObservation) => {
        await db.transaction((tx) => applyCanonicalObservation(tx, nextObservation, job.id));
      },
    });
    await db.transaction((tx) => markMonitorJobDone(tx, job.id, observation.observedAt, workerId));
  } catch (error) {
    await failMonitorJob(job.id, job.attempts, error, new Date(), workerId);
    console.error("[monitor-worker] job failed", { jobId: job.id, error: error instanceof Error ? error.name : "unknown" });
  }
}

export async function startMonitorWorker() {
  const config = getConfig();
  let stopping = false;
  let activeTick: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let lastHeartbeatAt = 0;
  let queueAgeSeconds: number | null = null;
  let lastMaintenanceAt = 0;

  const getSnapshot = (): MonitorHealthSnapshot => ({
    workerId: config.workerId,
    healthy: lastHeartbeatAt > 0 && Date.now() - lastHeartbeatAt <= config.pollIntervalMs * 3,
    queueAgeSeconds,
  });
  const healthHandler = createMonitorHealthHandler(getSnapshot);
  const httpServer = createServer(async (request, response) => {
    if (request.method === "GET" && request.url?.split("?", 1)[0] === "/healthz") {
      const health = await healthHandler(new Request(`http://127.0.0.1/healthz`));
      response.statusCode = health.status;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(await health.text());
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  await new Promise<void>((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(config.healthPort, "0.0.0.0", resolve); });

  let resolveShutdown!: () => void;
  const shutdown = new Promise<void>((resolve) => { resolveShutdown = resolve; });
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (timer) clearInterval(timer);
    if (activeTick) await activeTick;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closeDatabase();
    resolveShutdown();
  };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });

  const tick = async () => {
    if (stopping || activeTick) return;
    activeTick = (async () => {
      try {
        const dispatch = await enqueueDueMonitorJobs(new Date(), config.batchSize);
        queueAgeSeconds = dispatch.oldestDueAt ? Math.max(0, Math.round((Date.now() - new Date(dispatch.oldestDueAt).getTime()) / 1000)) : null;
        const jobs = await claimMonitorJobs(config.workerId, config.batchSize);
        await runPool(jobs, config.probeConcurrency, (job) => processJob(job, config.workerId));
        const now = Date.now();
        if (now - lastMaintenanceAt >= 15 * 60_000) {
          await db.transaction((tx) => updateCanonicalAvailability(tx, new Date()));
          await db.transaction((tx) => pruneCanonicalPlayerHistory(tx));
          await runOptionalMaintenance();
          lastMaintenanceAt = now;
        }
        lastHeartbeatAt = Date.now();
      } catch (error) {
        console.error("[monitor-worker] tick failed", error instanceof Error ? error.name : "unknown");
      } finally {
        activeTick = null;
      }
    })();
    await activeTick;
  };

  await tick();
  timer = setInterval(() => { void tick(); }, config.pollIntervalMs);
  timer.unref();
  await shutdown;
}

void startMonitorWorker().catch((error) => {
  console.error("[monitor-worker] startup failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
