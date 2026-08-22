import "dotenv/config";

import { hostname } from "node:os";

import { runMonitorBusinessEventsBatch } from "@/lib/monitor/business-events-runner";
import { createMonitorBoss, MONITOR_BUSINESS_EVENTS_QUEUE_NAME, scheduleMonitorBusinessEvents } from "@/lib/monitor/queue";
import type { PendingMonitorEvent } from "@/lib/monitor/events";
import { acknowledgeMonitorBusinessEvent, claimMonitorBusinessEvents, failMonitorBusinessEvent } from "@/lib/servers/monitor-api-client";

type WorkerConfig = {
  workerId: string;
  batchSize: number;
};

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getConfig(): WorkerConfig {
  if (!process.env.MONITOR_DATABASE_URL?.trim()) {
    throw new Error("MONITOR_DATABASE_URL is required for the business-event scheduler.");
  }
  if (!process.env.MONITOR_API_URL?.trim()) {
    throw new Error("MONITOR_API_URL is required for the business-event processor.");
  }
  if (!process.env.MONITOR_API_SECRET?.trim() && !process.env.CRON_MONITOR_SECRET?.trim()) {
    throw new Error("MONITOR_API_SECRET or CRON_MONITOR_SECRET is required for the business-event processor.");
  }

  return {
    workerId: process.env.MONITOR_BUSINESS_EVENTS_WORKER_ID?.trim() || `monitor-business-events:${hostname()}`,
    batchSize: numberEnv("MONITOR_BUSINESS_EVENTS_BATCH_SIZE", 100),
  };
}

function createLazyNeonProcessor() {
  let processInNeon: ((events: readonly PendingMonitorEvent[]) => Promise<void>) | undefined;
  let closeNeon: (() => Promise<void>) | undefined;

  return {
    process: async (events: readonly PendingMonitorEvent[]) => {
      if (!processInNeon) {
        const neonEvents = await import("@/lib/monitor/neon-events");
        const database = await import("@/db");
        processInNeon = neonEvents.processMonitorBusinessEventsInNeon;
        closeNeon = database.closeDatabase;
      }
      await processInNeon(events);
    },
    close: async () => {
      await closeNeon?.();
    },
  };
}

export async function startMonitorBusinessEventsWorker() {
  const config = getConfig();
  const boss = createMonitorBoss();
  const neon = createLazyNeonProcessor();
  let stopping = false;

  await boss.start();
  await boss.createQueue(MONITOR_BUSINESS_EVENTS_QUEUE_NAME, {
    notify: true,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  });
  await scheduleMonitorBusinessEvents(boss);
  await boss.work(MONITOR_BUSINESS_EVENTS_QUEUE_NAME, {
    localConcurrency: 1,
    batchSize: 1,
    pollingIntervalSeconds: 2,
  }, async () => {
    const result = await runMonitorBusinessEventsBatch({
      workerId: config.workerId,
      limit: config.batchSize,
      claim: claimMonitorBusinessEvents,
      processInNeon: neon.process,
      ack: (eventId, workerId) => acknowledgeMonitorBusinessEvent(eventId, workerId).then(() => undefined),
      fail: (eventId, workerId, error) => failMonitorBusinessEvent(eventId, workerId, error).then(() => undefined),
    });
    if (!result.available) throw new Error("Monitor API is unavailable; pg-boss will retry the event batch.");
    console.info("[monitor-business-events] batch processed", result);
    return result;
  });

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await boss.stop();
    await neon.close();
  };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
  await new Promise<void>(() => undefined);
}

void startMonitorBusinessEventsWorker().catch((error) => {
  console.error("[monitor-business-events] startup failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
