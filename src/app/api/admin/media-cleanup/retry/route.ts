import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaCleanupJobs } from "@/schema";
import { getPlatformRole } from "@/lib/admin";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (await getPlatformRole(session.user.id)) !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string").slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ error: "No jobs selected." }, { status: 400 });
  await db.update(mediaCleanupJobs).set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null }).where(and(inArray(mediaCleanupJobs.id, ids), eq(mediaCleanupJobs.status, "failed")));
  return NextResponse.json({ ok: true });
}
