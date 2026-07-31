import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { serverEndpoints, monitorRuns } from "@/schema";
import { serverEnv } from "@/env/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = serverEnv.MONITOR_SECRET;
  const signature = request.headers.get("x-monitor-signature") ?? "";
  const raw = await request.text();
  if (!secret || !signature) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const body = JSON.parse(raw) as { runId?: string; nonce?: string; results?: Array<{ serverId: string; edition: "java" | "bedrock"; online: boolean; playersCurrent?: number; playersMax?: number; version?: string; latencyMs?: number }> };
  if (!body.runId || !body.nonce || !Array.isArray(body.results)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const results = body.results;
  const [run] = await db.select().from(monitorRuns).where(and(eq(monitorRuns.runId, body.runId), eq(monitorRuns.nonce, body.nonce))).limit(1);
  if (!run || run.status !== "pending" || run.expiresAt <= new Date()) return NextResponse.json({ error: "Expired run" }, { status: 409 });
  await db.transaction(async (tx) => {
    for (const result of results.slice(0, 200)) await tx.update(serverEndpoints).set({ healthStatus: result.online ? "online" : "offline", playersCurrent: result.playersCurrent ?? null, playersMax: result.playersMax ?? null, version: result.version?.slice(0, 100) ?? null, latencyMs: result.latencyMs ?? null, lastCheckedAt: new Date(), lastOnlineAt: result.online ? new Date() : undefined, consecutiveFailures: result.online ? 0 : 3 }).where(and(eq(serverEndpoints.serverId, result.serverId), eq(serverEndpoints.edition, result.edition)));
    await tx.update(monitorRuns).set({ status: "done" }).where(eq(monitorRuns.runId, run.runId));
  });
  return NextResponse.json({ ok: true, processed: results.length });
}
