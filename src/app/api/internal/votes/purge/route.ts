import { serverEnv } from "@/env/server";
import { isValidMonitorAuthorization } from "@/lib/servers/monitor-route";
import { purgeExpiredVoteIpHashes } from "@/lib/votes/service";

/**
 * Daily: clears the IP hashes of votes past their retention. The same bearer secret as the other
 * internal jobs, called by the vote maintenance workflow.
 */
export async function POST(request: Request) {
  if (!isValidMonitorAuthorization(request.headers.get("authorization"), serverEnv.CRON_MONITOR_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ ok: true, cleared: await purgeExpiredVoteIpHashes() });
}
