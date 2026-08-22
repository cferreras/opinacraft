import { serverEnv } from "@/env/server";
import { runMonitorBusinessEventsBatch } from "@/lib/monitor/business-events-runner";
import { acknowledgeMonitorBusinessEvent, claimMonitorBusinessEvents, failMonitorBusinessEvent } from "@/lib/servers/monitor-api-client";
import { isValidMonitorAuthorization } from "@/lib/servers/monitor-route";

export async function POST(request: Request) {
  if (!isValidMonitorAuthorization(request.headers.get("authorization"), serverEnv.CRON_MONITOR_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = `vercel-monitor-events:${process.env.VERCEL_REGION ?? "default"}`;
  try {
    const result = await runMonitorBusinessEventsBatch({
      workerId,
      claim: claimMonitorBusinessEvents,
      processInNeon: async (events) => {
        // This import is deliberately after the Monitor API claim. An empty batch never loads Neon.
        const { processMonitorBusinessEventsInNeon } = await import("@/lib/monitor/neon-events");
        await processMonitorBusinessEventsInNeon(events);
      },
      ack: (eventId, claimedWorkerId) => acknowledgeMonitorBusinessEvent(eventId, claimedWorkerId).then(() => undefined),
      fail: (eventId, claimedWorkerId, error) => failMonitorBusinessEvent(eventId, claimedWorkerId, error).then(() => undefined),
    });
    if (!result.available) {
      return Response.json({ error: "Monitor API unavailable." }, { status: 503, headers: { "retry-after": "60" } });
    }
    return Response.json({ ok: true, claimed: result.claimed, processed: result.processed, failed: result.failed });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Monitor event processing failed." }, { status: 503, headers: { "retry-after": "60" } });
  }
}
