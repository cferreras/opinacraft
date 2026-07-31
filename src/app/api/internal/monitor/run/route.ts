import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "node:crypto";
import { monitorRuns } from "@/schema";
import { db } from "@/db";

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
  const runId = randomUUID();
  const nonce = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(monitorRuns).values({ runId, nonce, expiresAt, fallbackEndpoints: result.fallback });
  return NextResponse.json({ ...result, runId, nonce, expiresAt: expiresAt.toISOString() });
}
