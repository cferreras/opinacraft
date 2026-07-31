import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { monitorRuns, notificationJobs, serverEndpoints, serverMembers } from "@/schema";
import { user } from "@/auth-schema";
import { serverEnv } from "@/env/server";

export const runtime = "nodejs";

const resultSchema = z.object({
  serverId: z.uuid(),
  edition: z.literal("bedrock"),
  online: z.boolean(),
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

export async function POST(request: Request) {
  const secret = serverEnv.MONITOR_SECRET;
  const signature = request.headers.get("x-monitor-signature") ?? "";
  const raw = await request.text();
  if (!secret || !signature) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(parsedBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const body = parsed.data;
  const results = [...new Map(body.results.map((result) => [`${result.serverId}:${result.edition}`, result])).values()];
  const outcome = await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(monitorRuns)
      .where(and(eq(monitorRuns.runId, body.runId), eq(monitorRuns.nonce, body.nonce)))
      .for("update")
      .limit(1);
    if (!run || run.expiresAt <= new Date()) return { error: "Expired run", status: 409 as const };
    if (run.status !== "pending") return { error: "Expired run", status: 409 as const };
    const dispatched = new Set(run.fallbackEndpoints.map((endpoint) => `${endpoint.serverId}:${endpoint.edition}`));
    if (results.some((result) => !dispatched.has(`${result.serverId}:${result.edition}`))) {
      return { error: "Result is not part of this monitor run.", status: 400 as const };
    }
    for (const result of results) {
      const [current] = await tx
        .select({ healthStatus: serverEndpoints.healthStatus, consecutiveFailures: serverEndpoints.consecutiveFailures })
        .from(serverEndpoints)
        .where(and(eq(serverEndpoints.serverId, result.serverId), eq(serverEndpoints.edition, result.edition), eq(serverEndpoints.verificationStatus, "verified")))
        .for("update")
        .limit(1);
      if (!current) continue;
      const now = new Date();
      const failures = result.online ? 0 : current.consecutiveFailures + 1;
      const nextHealth = result.online ? "online" : failures >= 3 ? "offline" : current.healthStatus;
      await tx
        .update(serverEndpoints)
        .set({ healthStatus: nextHealth, playersCurrent: result.playersCurrent ?? null, playersMax: result.playersMax ?? null, version: result.version ?? null, latencyMs: result.latencyMs ?? null, lastCheckedAt: now, lastOnlineAt: result.online ? now : undefined, consecutiveFailures: failures })
        .where(and(eq(serverEndpoints.serverId, result.serverId), eq(serverEndpoints.edition, result.edition)));
      const transition = result.online && current.healthStatus === "offline"
        ? "recovered"
        : !result.online && failures >= 3 && current.healthStatus !== "offline"
          ? "down"
          : null;
      if (transition) {
        const [owner] = await tx
          .select({ userId: serverMembers.userId, email: user.email })
          .from(serverMembers)
          .innerJoin(user, eq(serverMembers.userId, user.id))
          .where(and(eq(serverMembers.serverId, result.serverId), eq(serverMembers.role, "owner")))
          .limit(1);
        if (owner?.email) {
          await tx.insert(notificationJobs).values({
            dedupeKey: `endpoint:${result.serverId}:${result.edition}:${transition}:${now.toISOString().slice(0, 10)}`,
            recipientUserId: owner.userId,
            recipientEmail: owner.email,
            template: `endpoint_${transition}`,
            payload: { serverId: result.serverId, edition: result.edition, transition },
          }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
        }
      }
    }
    await tx.update(monitorRuns).set({ status: "done" }).where(eq(monitorRuns.runId, run.runId));
    return { processed: results.length };
  });
  if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, processed: outcome.processed });
}
