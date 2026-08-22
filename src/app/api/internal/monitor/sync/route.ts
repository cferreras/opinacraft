import { serverEnv } from "@/env/server";
import { processMonitorSyncOutbox } from "@/lib/servers/monitor-sync";
import { isValidMonitorAuthorization } from "@/lib/servers/monitor-route";

export async function POST(request: Request) {
  if (!isValidMonitorAuthorization(request.headers.get("authorization"), serverEnv.CRON_MONITOR_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ ok: true, ...(await processMonitorSyncOutbox({ limit: 100 })) });
}
