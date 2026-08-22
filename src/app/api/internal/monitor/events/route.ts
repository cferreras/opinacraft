import { serverEnv } from "@/env/server";
import { processPendingMonitorEvents } from "@/lib/monitor/events";
import { acknowledgeMonitorBusinessEvent, claimMonitorBusinessEvents, failMonitorBusinessEvent } from "@/lib/servers/monitor-api-client";
import { isValidMonitorAuthorization } from "@/lib/servers/monitor-route";

export async function POST(request: Request) {
  if (!isValidMonitorAuthorization(request.headers.get("authorization"), serverEnv.CRON_MONITOR_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = `vercel-monitor-events:${process.env.VERCEL_REGION ?? "default"}`;
  const claimed = await claimMonitorBusinessEvents(workerId, 100);
  if (claimed === null) {
    return Response.json({ error: "Monitor API unavailable." }, { status: 503, headers: { "retry-after": "60" } });
  }

  const result = await processPendingMonitorEvents({
    claim: async () => claimed,
    processInNeon: async (events) => {
      // This import is deliberately after the Monitor API claim. An empty batch never loads Neon.
      const { processMonitorBusinessEventsInNeon } = await import("@/lib/monitor/neon-events");
      await processMonitorBusinessEventsInNeon(events);
    },
    ack: (eventId) => acknowledgeMonitorBusinessEvent(eventId, workerId).then(() => undefined),
    fail: (eventId, error) => failMonitorBusinessEvent(eventId, workerId, error).then(() => undefined),
  });
  return Response.json({ ok: true, ...result });
}
