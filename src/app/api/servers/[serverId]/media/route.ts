import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { serverMedia, servers } from "@/schema";
import { requireServerCapability, ServerPermissionError } from "@/lib/servers/permissions";
import { MediaValidationError, optimizeImage } from "@/lib/media/optimize";
import { mediaStorage, MediaStorageNotConfiguredError } from "@/lib/media/storage";
import { enqueueMediaCleanup } from "@/lib/media/cleanup";
import { getMediaQuota, MediaAccountQuotaExceededError, MediaQuotaExceededError, releaseMediaQuota, reserveAccountMediaOperation, reserveMediaQuota } from "@/lib/media/quota";

export async function GET(_request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { serverId } = await params;
  try {
    await requireServerCapability(serverId, session.user.id, "content:edit");
    const active = await db.select({ kind: serverMedia.kind, url: serverMedia.blobUrl, bytes: serverMedia.bytes, width: serverMedia.width, height: serverMedia.height }).from(serverMedia).where(and(eq(serverMedia.serverId, serverId), eq(serverMedia.status, "active")));
    return NextResponse.json({ active, quota: await getMediaQuota() });
  } catch (error) {
    if (error instanceof ServerPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "Unable to load media." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!session.user.emailVerified) return NextResponse.json({ error: "Verify your email before uploading media." }, { status: 403 });
  const { serverId } = await params;
  let reservedBytes = 0;
  let committed = false;

  try {
    await requireServerCapability(serverId, session.user.id, "content:edit");
    const body = await request.formData();
    const kindValue = body.get("kind");
    const kind = kindValue === "logo" || kindValue === "banner" ? kindValue : null;
    const file = body.get("file");
    if (!kind || !(file instanceof File)) return NextResponse.json({ error: "Choose an image and media kind." }, { status: 400 });

    // Claim the account's own share of the shared monthly budget before any
    // image processing, so one account cannot block uploads for everyone else.
    // The claim is never refunded: see reserveAccountMediaOperation.
    await reserveAccountMediaOperation(session.user.id);

    const optimized = await optimizeImage(file, kind);
    await reserveMediaQuota(optimized.bytes);
    reservedBytes = optimized.bytes;
    const key = `servers/${serverId}/${kind}/${randomUUID()}.webp`;
    const stored = await mediaStorage.upload(key, optimized.body, optimized.contentType);
    let previousKeys: string[] = [];
    let previousBytes = 0;
    try {
      await db.transaction(async (tx) => {
        const [server] = await tx.select({ id: servers.id }).from(servers).where(eq(servers.id, serverId)).limit(1);
        if (!server) throw new Error("Server not found.");
        // Conditional UPDATE ... RETURNING claims the replaced row exactly once,
        // so two concurrent uploads cannot both refund the same bytes.
        const previous = await tx
          .update(serverMedia)
          .set({ status: "deleted" })
          .where(and(eq(serverMedia.serverId, serverId), eq(serverMedia.kind, kind), eq(serverMedia.status, "active")))
          .returning({ blobKey: serverMedia.blobKey, bytes: serverMedia.bytes });
        previousKeys = previous.map((row) => row.blobKey);
        previousBytes = previous.reduce((total, row) => total + row.bytes, 0);
        const [pending] = await tx.insert(serverMedia).values({ serverId, kind, blobKey: stored.key, blobUrl: stored.url, contentType: optimized.contentType, bytes: optimized.bytes, width: optimized.width, height: optimized.height, status: "pending" }).returning({ id: serverMedia.id });
        if (!pending) throw new Error("No se pudo registrar el medio.");
        await tx.update(serverMedia).set({ status: "active" }).where(eq(serverMedia.id, pending.id));
      });
    } catch (error) {
      await mediaStorage.remove(stored.key).catch((cleanupError) => enqueueMediaCleanup(stored.key, cleanupError));
      throw error;
    }
    committed = true;
    await Promise.all(previousKeys.map((oldKey) => mediaStorage.remove(oldKey).catch((error) => enqueueMediaCleanup(oldKey, error))));
    if (previousBytes) await releaseMediaQuota(previousBytes);
    return NextResponse.json({ ok: true, kind, url: stored.url, active: { kind, url: stored.url, bytes: optimized.bytes, width: optimized.width, height: optimized.height }, quota: await getMediaQuota() });
  } catch (error) {
    if (!committed && reservedBytes > 0) await releaseMediaQuota(reservedBytes).catch(() => undefined);
    if (error instanceof MediaValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof MediaStorageNotConfiguredError) return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
    if (error instanceof MediaAccountQuotaExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof MediaQuotaExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof ServerPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("Failed to upload server media", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to upload media." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!session.user.emailVerified) return NextResponse.json({ error: "Verify your email before deleting media." }, { status: 403 });
  const { serverId } = await params;
  const kindValue = new URL(request.url).searchParams.get("kind");
  const kind = kindValue === "logo" || kindValue === "banner" ? kindValue : null;
  if (!kind) return NextResponse.json({ error: "Invalid media kind." }, { status: 400 });
  try {
    await requireServerCapability(serverId, session.user.id, "content:edit");
    // A single conditional UPDATE claims the active row, so concurrent deletes
    // cannot both refund the same bytes to the shared storage counter.
    const released = await db
      .update(serverMedia)
      .set({ status: "deleted" })
      .where(and(eq(serverMedia.serverId, serverId), eq(serverMedia.kind, kind), eq(serverMedia.status, "active")))
      .returning({ blobKey: serverMedia.blobKey, bytes: serverMedia.bytes });
    if (!released.length) return NextResponse.json({ ok: true, kind, active: null, quota: await getMediaQuota() });
    const releasedBytes = released.reduce((total, row) => total + row.bytes, 0);
    if (releasedBytes > 0) await releaseMediaQuota(releasedBytes);
    await Promise.all(released.map(({ blobKey }) => mediaStorage.remove(blobKey).catch((error) => enqueueMediaCleanup(blobKey, error))));
    return NextResponse.json({ ok: true, kind, active: null, quota: await getMediaQuota() });
  } catch (error) {
    if (error instanceof ServerPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("Failed to delete server media", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to delete media." }, { status: 500 });
  }
}
