import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { monitorRuns } from "@/schema";
import { serverEnv } from "@/env/server";
import { applyEndpointObservation } from "@/lib/servers/monitor-persistence";
import { updateAvailabilityVisibility } from "@/lib/servers/monitor";

export const runtime = "nodejs";
export const maxDuration = 180;

const resultSchema = z.object({
  serverId: z.uuid(),
  edition: z.literal("bedrock"),
  historySourceId: z.uuid(),
  online: z.boolean(),
  failureCode: z.enum(["unreachable", "timeout", "invalid_response", "dns_error", "blocked_target", "monitor_error"]).nullable().optional(),
  playersCurrent: z.number().int().nonnegative().nullable().optional(),
  playersMax: z.number().int().nonnegative().nullable().optional(),
  version: z.string().max(100).nullable().optional(),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
});

const payloadSchema = z.object({
  runId: z.string().min(1).max(100),
  nonce: z.string().min(1).max(128),
  results: z.array(resultSchema).max(200),
});

function resultKey(result: { serverId: string; edition: "bedrock"; historySourceId: string }) {
  return `${result.serverId}:${result.edition}:${result.historySourceId}`;
}

async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await task(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
}

export async function POST(request: Request) {
  const secret = serverEnv.MONITOR_SECRET;
  const signature = request.headers.get("x-monitor-signature") ?? "";
  const raw = await request.text();
  if (!secret || !signature) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(parsedBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const body = parsed.data;

  const claim = await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(monitorRuns)
      .where(and(eq(monitorRuns.runId, body.runId), eq(monitorRuns.nonce, body.nonce)))
      .for("update")
      .limit(1);
    if (!run) return { error: "Unknown monitor run", status: 409 as const };
    if (run.status === "done") return { duplicate: true as const };
    if (run.expiresAt <= new Date()) return { error: "Expired run", status: 409 as const };
    if (run.status === "processing" && run.processingStartedAt && Date.now() - run.processingStartedAt.getTime() < 2 * 60 * 1000) {
      return { error: "Monitor results are already being processed.", status: 409 as const };
    }

    const dispatched = new Set(run.fallbackEndpoints.map(resultKey));
    const uniqueResults = new Map(body.results.map((result) => [resultKey(result), result]));
    const supplied = new Set(uniqueResults.keys());
    if (supplied.size !== dispatched.size || [...dispatched].some((key) => !supplied.has(key))) {
      return { error: "Results do not match the dispatched Bedrock endpoints.", status: 400 as const };
    }

    await tx.update(monitorRuns).set({ status: "processing", processingStartedAt: new Date() }).where(eq(monitorRuns.runId, run.runId));
    return { duplicate: false as const, results: [...uniqueResults.values()], sampledAt: run.sampledAt, javaPersistenceFailures: run.javaPersistenceFailures };
  });

  if ("error" in claim) return NextResponse.json({ error: claim.error }, { status: claim.status });
  if (claim.duplicate) return NextResponse.json({ ok: true, duplicate: true });

  let persistenceFailures = 0;
  let persisted = 0;
  await runPool(claim.results, 2, async (result) => {
    try {
      await db.transaction(async (tx) => {
        const outcome = await applyEndpointObservation(tx, {
          serverId: result.serverId,
          edition: "bedrock",
          historySourceId: result.historySourceId,
          sampledAt: claim.sampledAt,
          runId: body.runId,
          status: result.online ? "online" : result.failureCode === "monitor_error" ? "unknown" : "offline",
          failureCode: result.failureCode ?? (result.online ? null : "unreachable"),
          playersCurrent: result.playersCurrent ?? null,
          playersMax: result.playersMax ?? null,
          version: result.version ?? null,
          latencyMs: result.latencyMs ?? null,
        });
        if (outcome.persisted || outcome.duplicate) persisted += 1;
      });
    } catch (error) {
      persistenceFailures += 1;
      console.error("[monitor] Bedrock observation persistence failed", { serverId: result.serverId, error });
    }
  });

  await db.transaction(async (tx) => {
    await tx
      .update(monitorRuns)
      .set({
        status: persistenceFailures || claim.javaPersistenceFailures ? "partial" : "done",
        bedrockPersistenceFailures: persistenceFailures,
        completedAt: persistenceFailures || claim.javaPersistenceFailures ? null : new Date(),
      })
      .where(eq(monitorRuns.runId, body.runId));
    await updateAvailabilityVisibility(tx);
  });

  if (persistenceFailures || claim.javaPersistenceFailures) {
    return NextResponse.json({ error: "Some monitor observations could not be persisted.", persisted, persistenceFailures, javaPersistenceFailures: claim.javaPersistenceFailures }, { status: 503 });
  }
  return NextResponse.json({ ok: true, processed: persisted });
}
