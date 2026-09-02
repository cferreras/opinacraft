import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { user } from "@/auth-schema";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { removeMediaOrEnqueue } from "@/lib/media/cleanup";
import { MediaValidationError, optimizeImage } from "@/lib/media/optimize";
import { getMediaQuota, MediaAccountQuotaExceededError, MediaQuotaExceededError, releaseAccountMediaOperation, releaseMediaQuota, reserveAccountMediaOperation, reserveMediaQuota } from "@/lib/media/quota";
import { mediaStorage, MediaStorageNotConfiguredError } from "@/lib/media/storage";
import { userAvatarsTag } from "@/lib/servers/cache-tags";

const MAX_AVATAR_FILE_BYTES = 4_000_000;
const MAX_AVATAR_REQUEST_BYTES = MAX_AVATAR_FILE_BYTES + 128_000;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let reservedBytes = 0;
  let reservedOperation = false;
  let committed = false;

  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_REQUEST_BYTES) {
      return NextResponse.json({ error: "El archivo original debe pesar 4 MB o menos." }, { status: 413 });
    }

    const body = await request.formData();
    const file = body.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });

    // Claim the account's own share of the shared monthly budget before any
    // image processing, so one account cannot block uploads for everyone else.
    await reserveAccountMediaOperation(session.user.id);
    reservedOperation = true;

    const optimized = await optimizeImage(file, "avatar");
    await reserveMediaQuota(optimized.bytes);
    reservedBytes = optimized.bytes;

    const stored = await mediaStorage.upload(
      `avatars/${session.user.id}/${randomUUID()}.webp`,
      optimized.body,
      optimized.contentType,
    );

    let previousKey: string | null = null;
    let previousBytes = 0;

    try {
      await db.transaction(async (tx) => {
        const [account] = await tx
          .select({ imageKey: user.imageKey, imageBytes: user.imageBytes })
          .from(user)
          .where(eq(user.id, session.user.id))
          .for("update");
        if (!account) throw new Error("User not found.");

        previousKey = account.imageKey ?? null;
        previousBytes = account.imageBytes ?? 0;
        await tx
          .update(user)
          .set({
            image: stored.url,
            imageKey: stored.key,
            imageBytes: optimized.bytes,
            updatedAt: new Date(),
          })
          .where(eq(user.id, session.user.id));
      });
      committed = true;
    } catch (error) {
      await removeMediaOrEnqueue(stored.key);
      throw error;
    }

    if (previousKey) await removeMediaOrEnqueue(previousKey);
    if (previousBytes) {
      await releaseMediaQuota(previousBytes).catch((error) => {
        console.error("Failed to release avatar media quota", error instanceof Error ? error.name : "unknown");
      });
    }

    revalidateTag(userAvatarsTag(), "max");

    return NextResponse.json({ ok: true, url: stored.url, quota: await getMediaQuota() });
  } catch (error) {
    if (!committed && reservedBytes > 0) await releaseMediaQuota(reservedBytes).catch(() => undefined);
    if (!committed && reservedOperation) await releaseAccountMediaOperation(session.user.id).catch(() => undefined);
    if (error instanceof MediaValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof MediaStorageNotConfiguredError) return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
    if (error instanceof MediaAccountQuotaExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof MediaQuotaExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("Failed to upload account avatar", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to upload avatar." }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let previousKey: string | null = null;
  let previousBytes = 0;

  try {
    await db.transaction(async (tx) => {
      const [account] = await tx
        .select({ imageKey: user.imageKey, imageBytes: user.imageBytes })
        .from(user)
        .where(eq(user.id, session.user.id))
        .for("update");
      if (!account) throw new Error("User not found.");

      previousKey = account.imageKey ?? null;
      previousBytes = account.imageBytes ?? 0;
      await tx
        .update(user)
        .set({ image: null, imageKey: null, imageBytes: null, updatedAt: new Date() })
        .where(eq(user.id, session.user.id));
    });

    if (previousKey) await removeMediaOrEnqueue(previousKey);
    if (previousBytes) {
      await releaseMediaQuota(previousBytes).catch((error) => {
        console.error("Failed to release avatar media quota", error instanceof Error ? error.name : "unknown");
      });
    }

    revalidateTag(userAvatarsTag(), "max");

    return NextResponse.json({ ok: true, quota: await getMediaQuota() });
  } catch (error) {
    console.error("Failed to remove account avatar", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to remove avatar." }, { status: 500 });
  }
}
