import { serverEnv } from "@/env/server";
import { runEndpointMonitor } from "@/lib/servers/monitor";
import { createMonitorPostHandler, methodNotAllowed } from "@/lib/servers/monitor-route";

export const runtime = "nodejs";
export const maxDuration = 180;

export const POST = createMonitorPostHandler({
  expectedSecret: serverEnv.CRON_MONITOR_SECRET,
  runMonitor: runEndpointMonitor,
});

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export function HEAD() {
  return methodNotAllowed();
}

export function OPTIONS() {
  return methodNotAllowed();
}
