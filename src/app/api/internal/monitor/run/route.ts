import { NextResponse } from "next/server";

import { serverEnv } from "@/env/server";
import { runEndpointMonitor } from "@/lib/servers/monitor";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const expected = serverEnv.MONITOR_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runEndpointMonitor();
  if (!result) return NextResponse.json({ error: "Monitor already running." }, { status: 409 });
  return NextResponse.json(result, { status: result.persistenceFailures && result.fallback.length === 0 ? 503 : 200 });
}
