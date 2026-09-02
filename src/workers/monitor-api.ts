import "dotenv/config";

import { createServer } from "node:http";

import { createMonitorApiHandler } from "@/lib/monitor/api";
import { closeMonitorDatabase } from "@/lib/monitor/db";
import { createMonitorBoss, MONITOR_QUEUE_NAME } from "@/lib/monitor/queue";
import { createMonitorApiNodeListener } from "./monitor-api-http";
import { numberEnv } from "./monitor-worker-config";

export async function startMonitorApi() {
  const secret = process.env.MONITOR_API_SECRET?.trim() || process.env.CRON_MONITOR_SECRET?.trim();
  if (!secret) throw new Error("MONITOR_API_SECRET or CRON_MONITOR_SECRET is required for Monitor API.");
  const boss = createMonitorBoss();
  await boss.start();
  await boss.createQueue(MONITOR_QUEUE_NAME);
  const handler = createMonitorApiHandler({ expectedSecret: secret, boss });
  const port = numberEnv("MONITOR_API_PORT", 3_002, 1);
  const server = createServer(createMonitorApiNodeListener({ secret, handler }));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", resolve);
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await boss.stop();
    await closeMonitorDatabase();
  };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
  await new Promise<void>(() => undefined);
}

void startMonitorApi().catch((error) => {
  console.error("[monitor-api] startup failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
