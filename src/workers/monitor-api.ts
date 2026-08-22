import "dotenv/config";

import { createServer, type IncomingMessage } from "node:http";

import { createMonitorApiHandler } from "@/lib/monitor/api";
import { closeMonitorDatabase } from "@/lib/monitor/db";
import { createMonitorBoss, MONITOR_QUEUE_NAME } from "@/lib/monitor/queue";
import { numberEnv } from "./monitor-worker-config";

async function requestFromNode(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks);
  return new Request(`http://${request.headers.host ?? "127.0.0.1"}${request.url ?? "/"}`, {
    method,
    headers: Object.fromEntries(Object.entries(request.headers).flatMap(([key, value]) => value ? [[key, Array.isArray(value) ? value.join(",") : value]] : [])),
    body,
    ...(body ? { duplex: "half" as const } : {}),
  });
}

export async function startMonitorApi() {
  const secret = process.env.MONITOR_API_SECRET?.trim() || process.env.CRON_MONITOR_SECRET?.trim();
  if (!secret) throw new Error("MONITOR_API_SECRET or CRON_MONITOR_SECRET is required for Monitor API.");
  const boss = createMonitorBoss();
  await boss.start();
  await boss.createQueue(MONITOR_QUEUE_NAME);
  const handler = createMonitorApiHandler({ expectedSecret: secret, boss });
  const port = numberEnv("MONITOR_API_PORT", 3_002, 1);
  const server = createServer(async (request, response) => {
    try {
      const result = await handler(await requestFromNode(request));
      response.statusCode = result.status;
      result.headers.forEach((value, key) => response.setHeader(key, value));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Monitor API failed." }));
    }
  });
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
