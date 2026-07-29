import { and, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  serverEndpoints,
  serverVerifications,
  servers,
} from "@/schema";
import { requireServerCapability } from "@/lib/servers/permissions";
import {
  BlockedMinecraftTargetError,
  MinecraftDnsError,
  resolveMinecraftTarget,
} from "@/lib/minecraft/network";
import {
  MinecraftOfflineError,
  MinecraftResponseError,
  MinecraftTimeoutError,
  pingJavaServer,
} from "@/lib/minecraft/ping";
import { motdContainsCode } from "@/lib/minecraft/motd";
import {
  decryptVerificationCode,
  encryptVerificationCode,
  generateVerificationCode,
  hashVerificationCode,
  VerificationConfigurationError,
} from "@/lib/servers/verification-crypto";

const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const GENERATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_GENERATIONS = 3;
const MAX_ATTEMPTS = 5;
const ATTEMPT_COOLDOWN_MS = 15 * 1000;
const OPERATION_TIMEOUT_MS = 8_000;

function isTokenHashCollision(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: { code?: unknown; constraint?: unknown };
  };
  const code = candidate.code ?? candidate.cause?.code;
  const constraint = candidate.constraint ?? candidate.cause?.constraint;
  return code === "23505" && typeof constraint === "string" && constraint.includes("token_hash");
}

async function withOperationTimeout<T>(operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new MinecraftTimeoutError()), OPERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type VerificationFailureCode =
  | "offline"
  | "timeout"
  | "invalid_response"
  | "code_not_found"
  | "blocked_target"
  | "endpoint_changed";

export class VerificationRateLimitError extends Error {
  constructor(message = "Please wait before requesting another verification code.") {
    super(message);
    this.name = "VerificationRateLimitError";
  }
}

export class VerificationUnavailableError extends Error {
  constructor() {
    super("There is no active verification to check.");
    this.name = "VerificationUnavailableError";
  }
}

export class VerificationExpiredError extends Error {
  constructor() {
    super("This verification code has expired.");
    this.name = "VerificationExpiredError";
  }
}

export class NoJavaEndpointError extends Error {
  constructor() {
    super("Add a Minecraft Java endpoint using a public port between 1024 and 65535 before verifying this server.");
    this.name = "NoJavaEndpointError";
  }
}

export async function startServerVerification(serverId: string, userId: string) {
  for (let tokenAttempt = 0; tokenAttempt < 3; tokenAttempt += 1) {
    try {
      return await db.transaction(async (tx) => {
    const [server] = await tx
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.id, serverId))
      .for("update")
      .limit(1);
    if (!server) throw new VerificationUnavailableError();
    await requireServerCapability(serverId, userId, "verification:manage", tx);

    const [endpoint] = await tx
      .select({ host: serverEndpoints.host, port: serverEndpoints.port })
      .from(serverEndpoints)
      .where(and(eq(serverEndpoints.serverId, serverId), eq(serverEndpoints.edition, "java")))
      .limit(1);
    if (!endpoint || endpoint.port < 1024 || endpoint.port > 65535) {
      throw new NoJavaEndpointError();
    }

    const now = new Date();
    await tx
      .update(serverVerifications)
      .set({ status: "expired" })
      .where(
        and(
          eq(serverVerifications.serverId, serverId),
          eq(serverVerifications.status, "pending"),
          lte(serverVerifications.expiresAt, now),
        ),
      );

    const since = new Date(now.getTime() - GENERATION_WINDOW_MS);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(serverVerifications)
      .where(
        and(
          eq(serverVerifications.serverId, serverId),
          eq(serverVerifications.requestedByUserId, userId),
          gte(serverVerifications.createdAt, since),
        ),
      );
    if (Number(count) >= MAX_GENERATIONS) throw new VerificationRateLimitError();

    await tx
      .update(serverVerifications)
      .set({ status: "superseded" })
      .where(and(eq(serverVerifications.serverId, serverId), eq(serverVerifications.status, "pending")));

    const code = generateVerificationCode();
    const [verification] = await tx
      .insert(serverVerifications)
      .values({
        serverId,
        requestedByUserId: userId,
        endpointHost: endpoint.host,
        endpointPort: endpoint.port,
        tokenHash: hashVerificationCode(code),
        tokenCiphertext: encryptVerificationCode(code),
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
      })
      .returning({ id: serverVerifications.id, expiresAt: serverVerifications.expiresAt });

    return { id: verification!.id, code, expiresAt: verification!.expiresAt };
      });
    } catch (error) {
      if (isTokenHashCollision(error) && tokenAttempt < 2) continue;
      throw error;
    }
  }
  throw new VerificationUnavailableError();
}

export async function getVerificationDisplay(serverId: string, userId: string) {
  await requireServerCapability(serverId, userId, "verification:manage");
  const [verification] = await db
    .select({
      id: serverVerifications.id,
      status: serverVerifications.status,
      attemptCount: serverVerifications.attemptCount,
      lastFailureCode: serverVerifications.lastFailureCode,
      lastAttemptAt: serverVerifications.lastAttemptAt,
      expiresAt: serverVerifications.expiresAt,
      tokenCiphertext: serverVerifications.tokenCiphertext,
    })
    .from(serverVerifications)
    .where(eq(serverVerifications.serverId, serverId))
    .orderBy(sql`${serverVerifications.createdAt} desc`)
    .limit(1);

  if (!verification) return null;
  const isActive = verification.status === "pending" && verification.expiresAt > new Date();
  let code: string | null = null;
  if (isActive) {
    try {
      code = decryptVerificationCode(verification.tokenCiphertext);
    } catch (error) {
      if (!(error instanceof VerificationConfigurationError)) throw error;
    }
  }
  return {
    id: verification.id,
    status: isActive ? verification.status : verification.status === "pending" ? "expired" : verification.status,
    attemptCount: verification.attemptCount,
    lastFailureCode: verification.lastFailureCode,
    lastAttemptAt: verification.lastAttemptAt,
    expiresAt: verification.expiresAt,
    code,
  };
}

export async function checkServerVerification(
  verificationId: string,
  serverId: string,
  userId: string,
) {
  const claimed = await db.transaction(async (tx) => {
    await requireServerCapability(serverId, userId, "verification:manage", tx);
    const now = new Date();
    const [row] = await tx
      .update(serverVerifications)
      .set({
        attemptCount: sql`${serverVerifications.attemptCount} + 1`,
        lastAttemptAt: now,
      })
      .where(
        and(
          eq(serverVerifications.id, verificationId),
          eq(serverVerifications.serverId, serverId),
          eq(serverVerifications.status, "pending"),
          gt(serverVerifications.expiresAt, now),
          lte(serverVerifications.attemptCount, MAX_ATTEMPTS - 1),
          or(
            isNull(serverVerifications.lastAttemptAt),
            lte(
              serverVerifications.lastAttemptAt,
              new Date(now.getTime() - ATTEMPT_COOLDOWN_MS),
            ),
          ),
        ),
      )
      .returning({
        id: serverVerifications.id,
        attemptCount: serverVerifications.attemptCount,
        endpointHost: serverVerifications.endpointHost,
        endpointPort: serverVerifications.endpointPort,
        tokenCiphertext: serverVerifications.tokenCiphertext,
      });

    if (!row) {
      const [existing] = await tx
        .select({
          status: serverVerifications.status,
          expiresAt: serverVerifications.expiresAt,
          attemptCount: serverVerifications.attemptCount,
          lastAttemptAt: serverVerifications.lastAttemptAt,
        })
        .from(serverVerifications)
        .where(and(eq(serverVerifications.id, verificationId), eq(serverVerifications.serverId, serverId)))
        .limit(1);
      if (existing?.status === "pending" && existing.expiresAt <= now) {
        await tx
          .update(serverVerifications)
          .set({ status: "expired" })
          .where(eq(serverVerifications.id, verificationId));
        return { expired: true as const };
      }
      if (existing?.status === "pending" && existing.attemptCount >= MAX_ATTEMPTS) {
        throw new VerificationRateLimitError("This verification code has reached its maximum number of checks.");
      }
      if (
        existing?.status === "pending" &&
        existing.lastAttemptAt &&
        existing.lastAttemptAt > new Date(now.getTime() - ATTEMPT_COOLDOWN_MS)
      ) {
        throw new VerificationRateLimitError("Wait 15 seconds between verification checks.");
      }
      throw new VerificationUnavailableError();
    }
    return {
      ...row,
      code: decryptVerificationCode(row.tokenCiphertext),
    };
  });

  if ("expired" in claimed) throw new VerificationExpiredError();

  let failure: VerificationFailureCode | null = null;
  let matches = false;
  const networkStartedAt = Date.now();
  try {
    const status = await withOperationTimeout(
      resolveMinecraftTarget(claimed.endpointHost, claimed.endpointPort)
        .then((target) => pingJavaServer(target)),
    );
    matches = motdContainsCode(status.description, claimed.code);
    if (!matches) failure = "code_not_found";
  } catch (error) {
    failure = error instanceof BlockedMinecraftTargetError
      ? "blocked_target"
      : error instanceof MinecraftResponseError
        ? "invalid_response"
      : error instanceof MinecraftTimeoutError
        ? "timeout"
        : error instanceof MinecraftDnsError || error instanceof MinecraftOfflineError
          ? "offline"
          : error instanceof VerificationConfigurationError
            ? "invalid_response"
            : "timeout";
  }
  console.info("[verification:check]", {
    serverId,
    verificationId: claimed.id,
    category: matches ? "verified" : failure ?? "invalid_response",
    durationMs: Date.now() - networkStartedAt,
  });

  return db.transaction(async (tx) => {
    const [server] = await tx
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.id, serverId))
      .for("update")
      .limit(1);
    if (!server) return { result: "stale" as const };
    await requireServerCapability(serverId, userId, "verification:manage", tx);
    const [currentEndpoint] = await tx
      .select({ host: serverEndpoints.host, port: serverEndpoints.port })
      .from(serverEndpoints)
      .where(and(eq(serverEndpoints.serverId, serverId), eq(serverEndpoints.edition, "java")))
      .limit(1);
    const [current] = await tx
      .select({
        status: serverVerifications.status,
        attemptCount: serverVerifications.attemptCount,
        expiresAt: serverVerifications.expiresAt,
      })
      .from(serverVerifications)
      .where(and(eq(serverVerifications.id, claimed.id), eq(serverVerifications.serverId, serverId)))
      .for("update")
      .limit(1);

    if (!current || current.status !== "pending") {
      return { result: "stale" as const };
    }
    if (current.expiresAt <= new Date()) {
      await tx
        .update(serverVerifications)
        .set({ status: "expired" })
        .where(eq(serverVerifications.id, claimed.id));
      return { result: "expired" as const };
    }
    if (!currentEndpoint || currentEndpoint.host !== claimed.endpointHost || currentEndpoint.port !== claimed.endpointPort) {
      await tx.update(serverVerifications).set({ status: "superseded", lastFailureCode: "endpoint_changed" }).where(eq(serverVerifications.id, claimed.id));
      return { result: "endpoint_changed" as const };
    }

    if (matches) {
      const verifiedAt = new Date();
      await tx.update(serverVerifications).set({ status: "verified", verifiedAt, lastFailureCode: null }).where(eq(serverVerifications.id, claimed.id));
      await tx.update(servers).set({ verificationStatus: "verified", verifiedAt }).where(eq(servers.id, serverId));
      return { result: "verified" as const };
    }

    const terminal = current.attemptCount >= MAX_ATTEMPTS;
    await tx.update(serverVerifications).set({ status: terminal ? "failed" : "pending", lastFailureCode: failure ?? "invalid_response" }).where(eq(serverVerifications.id, claimed.id));
    return { result: failure ?? "invalid_response" as const, attemptsRemaining: Math.max(0, MAX_ATTEMPTS - current.attemptCount) };
  });
}
