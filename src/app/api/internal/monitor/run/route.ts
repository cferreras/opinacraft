import { serverEnv } from "@/env/server";
import { enqueueDueMonitorJobs } from "@/lib/servers/monitor-queue";
import { createMonitorPostHandler, methodNotAllowed } from "@/lib/servers/monitor-route";

export const POST = createMonitorPostHandler({
  expectedSecret: serverEnv.CRON_MONITOR_SECRET,
  enqueueMonitor: () => enqueueDueMonitorJobs(),
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
